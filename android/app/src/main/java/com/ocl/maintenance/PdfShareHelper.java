package com.ocl.maintenance;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Writes the report WebView to a PDF, then offers Share (ACTION_SEND + FileProvider)
 * or the existing PrintManager print / save path.
 */
final class PdfShareHelper {
    private static final int A4_WIDTH = 595;
    private static final int A4_HEIGHT = 842;

    private PdfShareHelper() {}

    static void offer(Activity activity, WebView webView, String jobName) {
        final String name = (jobName == null || jobName.trim().isEmpty())
                ? "Adani Cements Maintenance Report"
                : jobName.trim();
        File dir = new File(activity.getCacheDir(), "share");
        if (!dir.isDirectory() && !dir.mkdirs()) {
            PrintHelper.print(activity, webView, name);
            return;
        }
        File pdf = new File(dir, fileName(name));
        final ProgressDialog wait = ProgressDialog.show(
                activity, null, activity.getString(R.string.pdf_preparing), true, false);
        webView.post(() -> {
            boolean ok = writePdf(webView, pdf);
            dismissQuietly(wait);
            if (ok) {
                showChooser(activity, webView, pdf, name);
            } else {
                Toast.makeText(activity, R.string.pdf_failed, Toast.LENGTH_SHORT).show();
                PrintHelper.print(activity, webView, name);
            }
        });
    }

    static void sharePdf(Activity activity, File pdf, String jobName) {
        if (pdf == null || !pdf.isFile() || pdf.length() == 0) {
            Toast.makeText(activity, R.string.pdf_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, MainActivity.FILE_PROVIDER, pdf);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/pdf");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, jobName);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newRawUri(jobName, uri));
        Intent chooser = Intent.createChooser(send, activity.getString(R.string.share_report));
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(chooser);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(activity, R.string.share_pdf_none, Toast.LENGTH_SHORT).show();
        }
    }

    private static void showChooser(Activity activity, WebView webView, File pdf, String jobName) {
        new AlertDialog.Builder(activity)
                .setTitle(R.string.share_pdf_title)
                .setMessage(R.string.share_pdf_message)
                .setPositiveButton(R.string.share_report, (d, w) -> sharePdf(activity, pdf, jobName))
                .setNeutralButton(R.string.print_save, (d, w) -> PrintHelper.print(activity, webView, jobName))
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private static boolean writePdf(WebView webView, File out) {
        int viewWidth = Math.max(webView.getWidth(), webView.getMeasuredWidth());
        if (viewWidth <= 0) viewWidth = A4_WIDTH * 2;
        webView.measure(
                View.MeasureSpec.makeMeasureSpec(viewWidth, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        int measuredH = webView.getMeasuredHeight();
        int contentH = webView.getContentHeight();
        int viewHeight = Math.max(measuredH, contentH);
        if (viewHeight <= 0) viewHeight = A4_HEIGHT * 2;
        webView.layout(0, 0, viewWidth, viewHeight);

        float scale = A4_WIDTH / (float) viewWidth;
        int scaledHeight = Math.max(A4_HEIGHT, (int) Math.ceil(viewHeight * scale));
        int pageCount = Math.max(1, (int) Math.ceil(scaledHeight / (float) A4_HEIGHT));

        PdfDocument doc = new PdfDocument();
        FileOutputStream fos = null;
        try {
            for (int i = 0; i < pageCount; i++) {
                PdfDocument.PageInfo info =
                        new PdfDocument.PageInfo.Builder(A4_WIDTH, A4_HEIGHT, i + 1).create();
                PdfDocument.Page page = doc.startPage(info);
                Canvas canvas = page.getCanvas();
                canvas.save();
                canvas.translate(0, -i * A4_HEIGHT);
                canvas.scale(scale, scale);
                webView.draw(canvas);
                canvas.restore();
                doc.finishPage(page);
            }
            if (out.exists() && !out.delete()) return false;
            fos = new FileOutputStream(out);
            doc.writeTo(fos);
            fos.flush();
            return out.isFile() && out.length() > 0;
        } catch (Exception e) {
            return false;
        } finally {
            if (fos != null) {
                try {
                    fos.close();
                } catch (Exception ignored) {
                    /* ignore */
                }
            }
            doc.close();
        }
    }

    private static void dismissQuietly(ProgressDialog wait) {
        if (wait == null) return;
        try {
            if (wait.isShowing()) wait.dismiss();
        } catch (Exception ignored) {
            /* activity may have gone */
        }
    }

    static String fileName(String jobName) {
        String raw = jobName.replaceAll("[^A-Za-z0-9._-]+", "-").replaceAll("^-+|-+$", "");
        if (raw.length() > 72) raw = raw.substring(0, 72);
        if (raw.isEmpty()) raw = "Adani-Cements-report";
        return raw + ".pdf";
    }
}
