import { Component, DestroyRef, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { APP_NAME } from '../../../core/brand';

/** Administrator sign-in. Not linked from the visitor site; reached at /admin/login. */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './admin-login.component.css'
})
export class AdminLoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private meta = inject(Meta);
  private destroyRef = inject(DestroyRef);

  readonly appName = APP_NAME;
  /** Sent here because the session timed out. */
  readonly expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');

  username = '';
  password = '';
  showPassword = signal(false);
  capsLock = signal(false);
  errorMessage = signal<string | null>(null);
  loading = signal(false);

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      void this.router.navigate(['/admin']);
      return;
    }
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.destroyRef.onDestroy(() => this.meta.removeTag('name="robots"'));
  }

  checkCaps(event: KeyboardEvent): void {
    this.capsLock.set(event.getModifierState?.('CapsLock') ?? false);
  }

  submit(): void {
    if (!this.username || !this.password || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.password = '';
        void this.router.navigate(['/admin']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.password = '';
        this.errorMessage.set(
          err.status === 429
            ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
            : err.status === 0
              ? 'Cannot reach the server. Please make sure the backend API is running.'
              : 'Invalid username or password.'
        );
      }
    });
  }
}
