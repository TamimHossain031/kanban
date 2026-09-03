import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * One structured line per request: method, path, status, latency.
 * Deliberately minimal — no bodies (they can carry secrets).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(`${method} ${originalUrl} ${res.statusCode} +${Date.now() - start}ms`);
        },
        error: (err) => {
          const status = err?.status ?? 500;
          this.logger.warn(`${method} ${originalUrl} ${status} +${Date.now() - start}ms`);
        },
      }),
    );
  }
}
