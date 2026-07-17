package cn.gamepulse.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GamePulseDocumentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
