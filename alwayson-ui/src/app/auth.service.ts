import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenKey = 'jwt_token';
  private currentUserKey = 'current_user';

  setToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setCurrentUser(username: string) {
    localStorage.setItem(this.currentUserKey, username);
  }
  
  getCurrentUser(): string | null {
    return localStorage.getItem(this.currentUserKey);
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.currentUserKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}
