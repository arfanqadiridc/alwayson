import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RightsService } from '../rights.service';

export const rightsGuard: CanActivateFn = (route, state) => {
  const rightsService = inject(RightsService);
  const router = inject(Router);

  // Example: Check for specific role required in route data
  const expectedRole = route.data['role'];
  
  if (expectedRole && !rightsService.hasRole(expectedRole)) {
    console.warn('[RightsGuard] Access Denied. Expected role:', expectedRole);
    router.navigate(['/chat']);
    return false;
  }

  return true;
};
