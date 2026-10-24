package com.shuwang.darkforest;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 只做一件事：把应用内下载好的安装包，以 content:// 的形式借给系统安装器去读。
 *
 * 为什么需要它：Android 7 以后禁止用 file:// 的 Uri 跨进程传文件（FileUriExposedException），
 * 官方做法是 FileProvider——但那要 androidx 依赖，本工程是纯命令行 javac，没有 support 库。
 * 于是手写一个最小实现：openFile 交出只读 fd，query 回答文件名和大小（安装器要拿这两个显示）。
 *
 * 权限模型：provider 自己 exported=false，靠 Intent 上的
 * FLAG_GRANT_READ_URI_PERMISSION 把「这一个 Uri」临时授权给安装器进程，用完即失效。
 */
public class ApkProvider extends ContentProvider {

    public static final String AUTHORITY = "com.shuwang.darkforest.apk";
    private static final String FILE_NAME = "update.apk";

    /** 交给安装器的 Uri：content://com.shuwang.darkforest.apk/update.apk */
    public static Uri uriFor() {
        return Uri.parse("content://" + AUTHORITY + "/" + FILE_NAME);
    }

    /** 安装包落地位置：优先外部私有目录（不受 4MB 缓存上限影响），没有就退回内部私有目录 */
    public static File fileIn(Context ctx) {
        File dir = ctx.getExternalFilesDir("apk");
        if (dir == null) dir = new File(ctx.getFilesDir(), "apk");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileIn(getContext());
        if (!f.exists()) throw new FileNotFoundException(f.getAbsolutePath());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    /** 安装器只关心 DISPLAY_NAME / SIZE，其余列一律给 null，别让它等超时 */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f = fileIn(getContext());
        String[] cols = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = "dark-forest.apk";
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
            else row[i] = null;
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
