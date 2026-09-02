import 'package:ecoeats/domain/entities/user.dart';
import 'package:ecoeats/domain/repositories/auth_repository.dart';

class SignInUseCase {
  final AuthRepository _repository;

  const SignInUseCase(this._repository);

  Future<UserEntity> call({
    required String email,
    required String password,
    required UserRole role,
  }) async {
    if (!_repository.isValidEmail(email)) {
      throw Exception("That email address doesn't look right.");
    }
    return _repository.signIn(
      email: email,
      password: password,
      role: role,
    );
  }
}
