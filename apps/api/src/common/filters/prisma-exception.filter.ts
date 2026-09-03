import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Translate known Prisma errors into clean HTTP responses so the client never
 * sees a raw Prisma error string.
 *   P2002 (unique violation)   → 409 Conflict
 *   P2025 (record not found)   → 404 Not Found
 *   P2003 (FK constraint)      → 400 Bad Request
 * Everything else → 500 (logged, generic message to the client).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const mapped = this.map(exception);
    if (mapped.status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack);
    }

    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      error: HttpStatus[mapped.status],
    });
  }

  private map(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists`
            : 'Unique constraint violation',
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record constraint failed',
        };
      default:
        // Preserve any HttpException semantics if somehow nested; else 500.
        if (exception instanceof HttpException) {
          const status = exception.getStatus();
          return { status, message: exception.message };
        }
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        };
    }
  }
}

// Re-export for symmetry; some codebases wire both. Not registered by default.
export { NotFoundException, ConflictException };
