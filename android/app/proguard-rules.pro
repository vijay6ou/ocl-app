# Keep the JS bridge names the WebView page calls.
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.ocl.maintenance.MainActivity$NativeBridge { *; }

# Manifest components keep their class names; shrink unused members.
-keep class com.ocl.maintenance.MainActivity
-keep class com.ocl.maintenance.CameraCaptureActivity
-keep class com.ocl.maintenance.PrintHelper
-keep class com.ocl.maintenance.PdfShareHelper
-keep class androidx.core.content.FileProvider

-dontwarn **
-ignorewarnings
