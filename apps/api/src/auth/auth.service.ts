import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, AuthUserSchema, LoginResponse, LoginResponseSchema } from '@trimatch/shared';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../identity/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return LoginResponseSchema.parse({
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User no longer exists' });
    }
    return AuthUserSchema.parse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  }
}
