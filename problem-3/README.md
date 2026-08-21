
# Problem 3 - Debugging Issues Within System

## 1. Summary

The application was deployed using Docker Compose and exposed through Nginx on port 8080.

The main issues identified were:

1. Nginx was configured to proxy requests to the wrong API port.
2. Docker Compose did not wait for PostgreSQL and Redis to become healthy before starting the API.
3. PostgreSQL connections were not released when a query failed.
4. The API health endpoint did not verify its dependencies.

## 2. Problems Found

### 2.1 Nginx upstream port mismatch

The API listens on port 3000, but Nginx was configured to proxy to port 3001.

This caused Nginx to fail when connecting to the API.

### 2.2 Dependency readiness

The original Docker Compose configuration used `depends_on`, but did not define health checks.

Container startup order does not guarantee that PostgreSQL and Redis are ready to accept connections.

### 2.3 PostgreSQL connection leak

The API released the PostgreSQL connection only after a successful query.

If the query failed, the connection was not released.

This could eventually exhaust the connection pool.

### 2.4 Incomplete health check

The original `/status` endpoint returned HTTP 200 without checking PostgreSQL or Redis.

Therefore, the API could report itself as healthy while a dependency was unavailable.

## 3. Diagnosis

The system was inspected by:

- Checking Docker Compose service status.
- Inspecting container logs.
- Testing the API through Nginx.
- Comparing the Nginx upstream port with the port used by the Node.js application.
- Reviewing the API database connection lifecycle.
- Checking PostgreSQL and Redis readiness.

## 4. Fixes Applied

### Nginx

Changed the upstream API port from `3001` to `3000`.

### Docker Compose

Added health checks for PostgreSQL and Redis.

Changed API startup dependencies to wait for healthy services.

Added an API health check.

### API

Changed PostgreSQL connection handling to always release connections using `finally`.

Added connection timeouts.

Improved Redis retry behavior.

Updated `/status` to verify PostgreSQL and Redis.

## 5. Validation

After applying the fixes:

- The application starts successfully.
- The API is accessible through Nginx.
- `/api/users` returns HTTP 200.
- The health endpoint reports dependency status.
- Repeated API requests remain successful.
- Dependency failures are reflected by the health endpoint.

## 6. Monitoring and Alerts

In production I would monitor:

- HTTP 5xx rate
- API latency
- Request rate
- Container restart count
- CPU and memory usage
- PostgreSQL connection pool usage
- PostgreSQL availability
- Redis availability
- Nginx upstream errors

Alerts should be configured for sustained high error rates, elevated latency, unhealthy services, excessive container restarts, and database connection exhaustion.

## 7. Production Prevention

To prevent similar issues:

- Use service health checks.
- Make deployments depend on readiness rather than only container startup.
- Add automated integration tests for service connectivity.
- Validate configuration during CI/CD.
- Monitor service dependencies.
- Use infrastructure and configuration validation before deployment.
- Document service ports and health endpoints.