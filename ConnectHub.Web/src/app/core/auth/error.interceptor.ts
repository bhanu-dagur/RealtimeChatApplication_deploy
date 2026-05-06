import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/components/toast/toast.service';

// Module-scoped dedupe map: keys are "status:METHOD:url" strings, values are
// the last-toasted timestamp. Without this, a backend endpoint that 500s on
// every click drowned the UI in identical toasts (one per request, plus one
// per retry, plus one per polling refresh). 3 seconds is long enough to
// suppress a click-storm but short enough that a different *kind* of error
// from the same endpoint still surfaces promptly.
const RECENT_TOASTS = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3000;

function shouldToast(key: string): boolean {
    const now = Date.now();
    const last = RECENT_TOASTS.get(key) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return false;
    RECENT_TOASTS.set(key, now);
    // Cheap GC: prune anything older than 30s so the map can't grow unbounded
    // during a long session of intermittent failures.
    if (RECENT_TOASTS.size > 50) {
        for (const [k, ts] of RECENT_TOASTS) {
            if (now - ts > 30_000) RECENT_TOASTS.delete(k);
        }
    }
    return true;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const toastSvc = inject(ToastService);

    return next(req).pipe(
        catchError((err: HttpErrorResponse) => {
            // Always log — DevTools console is the diagnostic channel of last
            // resort, even when we suppress the user-facing toast. Includes
            // the server's response body when available so the failing
            // endpoint can be identified without rerunning the request.
            console.error(
                '[HTTP error]', err.status, req.method, req.url,
                err.error ?? err.statusText
            );

            const key = `${err.status}:${req.method}:${req.url}`;

            switch (err.status) {
                case 0:
                    if (shouldToast(key)) {
                        toastSvc.error('Connection failed', 'Check if backend is running.');
                    }
                    break;

                case 401:
                    // Auth failures are silent — kick the user to /login and
                    // let the login screen explain. No dedupe needed; the
                    // navigate stops the cascade naturally.
                    localStorage.removeItem('ch_token');
                    localStorage.removeItem('ch_user');
                    router.navigate(['/login']);
                    break;

                case 403:
                    if (shouldToast(key)) {
                        toastSvc.error('Access denied', 'You don\'t have permission.');
                    }
                    break;

                case 404:
                    // Don't show toast — components handle 404 in their own
                    // .subscribe error branches with context-specific messaging.
                    break;

                case 413:
                    if (shouldToast(key)) {
                        toastSvc.error('File too large', 'Please choose a smaller file.');
                    }
                    break;

                case 429:
                    if (shouldToast(key)) {
                        toastSvc.warning('Too many requests', 'Please wait a moment.');
                    }
                    break;

                case 500:
                case 502:
                case 503:
                case 504:
                    // Server-side failures: dedupe per-endpoint. If the user
                    // is hitting "Send" repeatedly against a broken backend
                    // they get one toast, not one per click. Server-supplied
                    // message wins over the generic fallback when available.
                    if (shouldToast(key)) {
                        const detail = err.error?.message
                            ?? err.error?.title
                            ?? 'Something went wrong on the server.';
                        toastSvc.error('Server error', detail);
                    }
                    break;

                default:
                    // Only surface a global toast when the server actually
                    // gave us a meaningful message. A bare 4xx with an empty
                    // body is almost always a background fetch that the
                    // originating component will handle on its own.
                    if (err.status >= 400 && err.status < 500) {
                        const msg = err.error?.message;
                        if (msg && shouldToast(key)) {
                            toastSvc.error('Error', msg);
                        }
                    }
            }

            return throwError(() => err);
        })
    );
};
