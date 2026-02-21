# Intent Map

This document provides an overview of all active intents and their relationships.

## INT-001: Weather API

**Status**: Active  
**Owner**: Agent B (Builder)  
**Description**: Build a Weather API that accepts city names and returns current weather conditions.

**Related Files**:

- `src/api/weather/weather.ts`
- `src/utils/weather/helpers.ts`
- `tests/weather/weather.test.ts`

**Dependencies**: None

**Progress**:

- [x] API endpoint structure defined
- [ ] External API integration
- [ ] Error handling implemented
- [ ] Tests written

---

## INT-002: User Authentication

**Status**: Active  
**Owner**: Agent A (Architect)  
**Description**: Implement JWT-based user authentication system with password hashing.

**Related Files**:

- `src/auth/auth.ts`
- `src/middleware/auth/middleware.ts`
- `tests/auth/auth.test.ts`

**Dependencies**: None

**Progress**:

- [x] Architecture defined
- [ ] JWT implementation
- [ ] Password hashing
- [ ] Route protection middleware

---

## Intent Relationships

- INT-001 and INT-002 are independent and can be developed in parallel.
