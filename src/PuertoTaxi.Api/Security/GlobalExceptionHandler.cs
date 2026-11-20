using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace PuertoTaxi.Api.Security;

/// <summary>Convierte cualquier excepción no controlada en un ProblemDetails sin filtrar detalles internos.</summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;

        var (status, title) = exception switch
        {
            UnauthorizedAccessException => (StatusCodes.Status401Unauthorized, "No autenticado"),
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Recurso no encontrado"),
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "Conflicto de concurrencia"),
            _ => (StatusCodes.Status500InternalServerError, "Error interno del servidor")
        };

        if (status == StatusCodes.Status500InternalServerError)
            logger.LogError(exception, "Error no controlado. TraceId={TraceId}", traceId);
        else
            logger.LogWarning(exception, "Error controlado ({Status}). TraceId={TraceId}", status, traceId);

        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";

        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Instance = context.Request.Path,
            Extensions = { ["traceId"] = traceId }
        }, ct);

        return true;
    }
}
