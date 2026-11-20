using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Security;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
[Produces("application/json")]
public sealed class MeController(AppDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<UserDto>> Get(CancellationToken ct)
    {
        var id = current.RequireId();
        var user = await db.Users
            .Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id, ct);

        if (user is null || !user.IsActive) return NotFound();
        return Ok(user.ToUserDto());
    }

    /// <summary>Solo permite cambiar el nombre. Rol, teléfono, email y estado NO se tocan desde aquí.</summary>
    [HttpPatch]
    public async Task<ActionResult<UserDto>> Update(UpdateMeRequest request, CancellationToken ct)
    {
        var id = current.RequireId();
        var user = await db.Users
            .Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id, ct);

        if (user is null || !user.IsActive) return NotFound();

        if (request.FullName is not null)
            user.FullName = request.FullName.Trim();

        user.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(user.ToUserDto());
    }
}
