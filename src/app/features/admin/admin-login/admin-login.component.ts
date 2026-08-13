import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-login.component.html'
})
export class AdminLoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  errorMessage = signal<string | null>(null);
  loading = signal(false);

  submit(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/admin']);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Invalid username or password.');
      }
    });
  }
}
