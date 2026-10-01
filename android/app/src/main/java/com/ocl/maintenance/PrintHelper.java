package com.ocl.maintenance;

import android.app.Activity;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.webkit.WebView;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** PrintManager path used by the original OCL APK (window.print is a no-op in WebView). */
final class PrintHelper {
    private PrintHelper() {}

    static void print(Activity activity, WebView webView, String jobName) {
        PrintManager manager = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
        if (manager == null) return;
        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
        PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
        manager.print(jobName, adapter, attrs);
    }

    /** Print / save an already-built plant PDF (same bytes as Discord). */
    static void printPdf(Activity activity, File pdf, String jobName) {
        PrintManager manager = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
        if (manager == null || pdf == null || !pdf.isFile()) return;
        final File source = pdf;
        final String name = (jobName == null || jobName.trim().isEmpty())
                ? "Adani Cements Maintenance Report"
                : jobName.trim();
        PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
            @Override
            public void onLayout(
                    PrintAttributes oldAttributes,
                    PrintAttributes newAttributes,
                    CancellationSignal cancellationSignal,
                    LayoutResultCallback callback,
                    Bundle extras) {
                if (cancellationSignal.isCanceled()) {
                    callback.onLayoutCancelled();
                    return;
                }
                PrintDocumentInfo info = new PrintDocumentInfo.Builder(name)
                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                        .build();
                callback.onLayoutFinished(info, true);
            }

            @Override
            public void onWrite(
                    PageRange[] pages,
                    ParcelFileDescriptor destination,
                    CancellationSignal cancellationSignal,
                    WriteResultCallback callback) {
                InputStream in = null;
                OutputStream out = null;
                try {
                    in = new FileInputStream(source);
                    out = new FileOutputStream(destination.getFileDescriptor());
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) >= 0) {
                        if (cancellationSignal.isCanceled()) {
                            callback.onWriteCancelled();
                            return;
                        }
                        out.write(buf, 0, n);
                    }
                    out.flush();
                    callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                } catch (Exception e) {
                    callback.onWriteFailed(e.getMessage());
                } finally {
                    if (in != null) {
                        try {
                            in.close();
                        } catch (Exception ignored) {
                            /* ignore */
                        }
                    }
                    if (out != null) {
                        try {
                            out.close();
                        } catch (Exception ignored) {
                            /* ignore */
                        }
                    }
                }
            }
        };
        PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
        manager.print(name, adapter, attrs);
    }
}
