import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class RightsService {

  constructor(private authService: AuthService) {}

  getRoles(): string[] {
    const token = this.authService.getToken();
    if (!token) return [];
    try {
      const decoded: any = jwtDecode(token);
      return decoded.roles || [];
    } catch (e) {
      return [];
    }
  }

  hasRole(role: string): boolean {
    return this.getRoles().includes(role);
  }

  canAccessEmployees(): boolean {
    return true; // Allow everyone to see the directory for chatting
  }
}
