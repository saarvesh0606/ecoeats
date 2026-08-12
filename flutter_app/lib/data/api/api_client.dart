import 'package:dio/dio.dart';

/// Where the API lives. Overridable at build time:
/// `flutter run --dart-define=ECOEATS_API_URL=http://localhost:8000`
const String kApiBaseUrl = String.fromEnvironment(
  'ECOEATS_API_URL',
  defaultValue: 'https://ecoeats-api.onrender.com',
);

const String kApiPrefix = '/api/v1';

/// Supplies the bearer token for a request, or null when signed out.
///
/// A function rather than a dependency on Firebase, so the whole data layer
/// can be built and exercised before auth exists — and so tests can hand it a
/// fixed token without standing up an auth stack.
typedef TokenProvider = Future<String?> Function();

/// An error the API reported, carrying the status so callers can tell the
/// difference between "gone" and "broken".
class ApiException implements Exception {
  ApiException(this.statusCode, this.message, {this.retryAfter});

  final int? statusCode;
  final String message;

  /// Present on 429, in seconds — the server tells us how long to wait.
  final int? retryAfter;

  /// Someone else took the last portion between the feed loading and the tap.
  bool get isConflict => statusCode == 409;
  bool get isUnauthorized => statusCode == 401 || statusCode == 403;
  bool get isNotFound => statusCode == 404;

  @override
  String toString() => message;
}

/// Thin wrapper over dio: base URL, bearer token, and one place where API
/// errors become [ApiException].
class ApiClient {
  ApiClient({required TokenProvider tokenProvider, Dio? dio})
      : _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = '$kApiBaseUrl$kApiPrefix'
      // Render's free tier sleeps, and the first request after that cold-starts
      // for the better part of a minute. A short timeout here reads as "the
      // API is down" when it is only waking up.
      ..connectTimeout = const Duration(seconds: 60)
      ..receiveTimeout = const Duration(seconds: 60)
      ..headers['Content-Type'] = 'application/json'
      // Let non-2xx through to the error interceptor rather than dio's default
      // handling, so every failure is shaped the same way.
      ..validateStatus = (status) => status != null && status < 400;

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await tokenProvider();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) => handler.reject(
          error.copyWith(error: _translate(error)),
        ),
      ),
    );
  }

  final Dio _dio;

  ApiException _translate(DioException error) {
    final response = error.response;
    if (response == null) {
      return ApiException(
        null,
        error.type == DioExceptionType.connectionTimeout ||
                error.type == DioExceptionType.receiveTimeout
            ? "The server is taking too long to answer. It may be waking up — try again."
            : "Couldn't reach EcoEats. Check your connection.",
      );
    }

    final status = response.statusCode;
    final data = response.data;
    // FastAPI puts the message under `detail`; validation errors make that a
    // list of objects rather than a string.
    String message = 'Something went wrong.';
    if (data is Map && data['detail'] != null) {
      final detail = data['detail'];
      if (detail is String) {
        message = detail;
      } else if (detail is List && detail.isNotEmpty) {
        final first = detail.first;
        if (first is Map && first['msg'] != null) message = '${first['msg']}';
      }
    }

    if (status == 409) {
      message = 'Someone just claimed the last of this.';
    } else if (status == 401 || status == 403) {
      message = 'Please sign in again.';
    }

    final retryAfter = int.tryParse(
      response.headers.value('retry-after') ?? '',
    );
    return ApiException(status, message, retryAfter: retryAfter);
  }

  Never _rethrow(DioException e) {
    final err = e.error;
    throw err is ApiException ? err : ApiException(null, e.message ?? 'Failed');
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get<dynamic>(path, queryParameters: query);
      return res.data;
    } on DioException catch (e) {
      _rethrow(e);
    }
  }

  Future<dynamic> post(String path, {Object? body}) async {
    try {
      final res = await _dio.post<dynamic>(path, data: body);
      return res.data;
    } on DioException catch (e) {
      _rethrow(e);
    }
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    try {
      final res = await _dio.patch<dynamic>(path, data: body);
      return res.data;
    } on DioException catch (e) {
      _rethrow(e);
    }
  }

  Future<void> delete(String path) async {
    try {
      await _dio.delete<dynamic>(path);
    } on DioException catch (e) {
      _rethrow(e);
    }
  }
}
