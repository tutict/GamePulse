package cn.gamepulse.mobile;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

@CapacitorPlugin(name = "GamePulseDocument")
public class GamePulseDocumentPlugin extends Plugin {
    private final Set<WebView> printWebViews = Collections.newSetFromMap(
        new IdentityHashMap<>()
    );

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName", "GamePulse report.pdf");
        if (html == null || html.trim().isEmpty()) {
            call.reject("Report HTML is required");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Android activity is unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(getContext());
                printWebViews.add(printWebView);
                printWebView.getSettings().setJavaScriptEnabled(false);
                printWebView.setWebViewClient(new WebViewClient() {
                    private boolean printed;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (printed) {
                            return;
                        }
                        printed = true;
                        try {
                            PrintManager manager = (PrintManager) getContext()
                                .getSystemService(Context.PRINT_SERVICE);
                            if (manager == null) {
                                releasePrintWebView(view);
                                call.reject("Android print service is unavailable");
                                return;
                            }
                            PrintDocumentAdapter delegate = view
                                .createPrintDocumentAdapter(jobName);
                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                            manager.print(
                                jobName,
                                releasingAdapter(delegate, view),
                                attributes
                            );
                            call.resolve(new JSObject());
                        } catch (Exception error) {
                            releasePrintWebView(view);
                            call.reject("Unable to open Android PDF print dialog", error);
                        }
                    }
                });
                printWebView.loadDataWithBaseURL(
                    "https://app.gamepulse.local/",
                    html,
                    "text/html",
                    "UTF-8",
                    null
                );
            } catch (Exception error) {
                call.reject("Unable to open Android PDF print dialog", error);
            }
        });
    }

    private PrintDocumentAdapter releasingAdapter(
        PrintDocumentAdapter delegate,
        WebView webView
    ) {
        return new PrintDocumentAdapter() {
            @Override
            public void onStart() {
                delegate.onStart();
            }

            @Override
            public void onLayout(
                PrintAttributes oldAttributes,
                PrintAttributes newAttributes,
                CancellationSignal cancellationSignal,
                LayoutResultCallback callback,
                Bundle extras
            ) {
                delegate.onLayout(
                    oldAttributes,
                    newAttributes,
                    cancellationSignal,
                    callback,
                    extras
                );
            }

            @Override
            public void onWrite(
                android.print.PageRange[] pages,
                ParcelFileDescriptor destination,
                CancellationSignal cancellationSignal,
                WriteResultCallback callback
            ) {
                delegate.onWrite(pages, destination, cancellationSignal, callback);
            }

            @Override
            public void onFinish() {
                try {
                    delegate.onFinish();
                } finally {
                    releasePrintWebView(webView);
                }
            }
        };
    }

    private void releasePrintWebView(WebView webView) {
        Runnable release = () -> {
            if (printWebViews.remove(webView)) {
                webView.stopLoading();
                webView.destroy();
            }
        };
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(release);
        } else {
            webView.post(release);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            for (WebView webView : printWebViews.toArray(new WebView[0])) {
                webView.stopLoading();
                webView.destroy();
            }
            printWebViews.clear();
        } finally {
            super.handleOnDestroy();
        }
    }
}
