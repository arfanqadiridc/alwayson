import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { rightsGuard } from './rights.guard';

describe('rightsGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => rightsGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
