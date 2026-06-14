import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username = '';
  password = '';
  errorMessage = '';

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/chat']);
    }
  }

  async onLogin() {
    try {
      const response: any = await firstValueFrom(
        this.http.post('http://localhost:8080/alwayson-api/api/auth/login', {
          username: this.username,
          password: this.password
        })
      );
      this.auth.setToken(response.token);
      this.auth.setCurrentUser(this.username);
      this.router.navigate(['/chat']);
    } catch (error) {
      this.errorMessage = 'Invalid credentials or Server offline.';
    }
  }
}
