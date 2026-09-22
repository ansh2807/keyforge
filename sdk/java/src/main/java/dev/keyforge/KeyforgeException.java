package dev.keyforge;

public final class KeyforgeException extends RuntimeException {
    private final String code;
    private final int statusCode;

    public KeyforgeException(String code, String message, int statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }

    public String code() { return code; }
    public int statusCode() { return statusCode; }
}
