Problem 4 — Ship It Twice

1. Overview

This solution implements production-oriented CI/CD pipelines for two independent applications:

- Backend: an HTTP API deployed to an AWS EC2 instance.
- Frontend: a static single-page application deployed to an AWS S3 bucket.

The pipelines are implemented using GitHub Actions.

The main goals are:

- Automatically validate changes before deployment.
- Deploy only validated code to production.
- Make deployments repeatable and auditable.
- Avoid storing deployment credentials in source code.
- Detect failed deployments.
- Provide a clear rollback strategy.
- Keep the pipelines simple enough to operate and maintain.

The workflows are:

.github/workflows/backend.yml
.github/workflows/frontend.yml

---

2. Assumptions

2.1 Repository structure

I assume the repository contains the applications in the following structure:

backend/
frontend/
.github/
└── workflows/
    ├── backend.yml
    └── frontend.yml

The backend is assumed to be a Node.js HTTP API with a "package.json".

The frontend is assumed to be a Node.js-based static SPA.

The frontend production build is assumed to be generated in:

frontend/dist

If the actual frontend framework produces a different output directory, the workflow should be adjusted accordingly.

---

2.2 Production branch

The "main" branch is treated as the production branch.

Pull requests run validation only.

Production deployment occurs only after a successful push to "main".

This prevents feature branches from directly deploying to production.

---

2.3 Backend deployment

The backend runs on an AWS EC2 instance.

The EC2 instance is assumed to already have:

- the required runtime installed;
- the backend service configured;
- AWS Systems Manager Agent installed;
- an appropriate IAM instance role;
- a health endpoint such as "/health".

The CI/CD pipeline is responsible for delivering and activating a new application release.

---

2.4 Frontend deployment

The frontend is a static SPA.

It does not require a Node.js server at runtime.

The production build is uploaded directly to an S3 bucket.

For a real production system, I would normally put Amazon CloudFront in front of S3 to provide:

- HTTPS;
- CDN caching;
- lower latency;
- custom domain support;
- better control over caching and invalidation.

CloudFront is not required for the core CI/CD implementation.

---

2.5 AWS authentication

The workflows require AWS access.

For the assessment, AWS credentials may be provided through GitHub Actions secrets.

The following secrets are assumed:

AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
BACKEND_INSTANCE_ID
BACKEND_ARTIFACT_BUCKET
FRONTEND_BUCKET

In a real production environment, I would prefer GitHub Actions OIDC federation with AWS IAM instead of long-lived access keys.

This avoids storing permanent AWS access keys in GitHub.

---

3. What "Production Ready" Means

For this assessment, I consider a pipeline production ready when it provides:

1. Automated testing before deployment.
2. Deterministic dependency installation.
3. Separate CI and deployment stages.
4. Deployment only from the production branch.
5. Protected production environments.
6. Secure credential handling.
7. Repeatable deployments.
8. Deployment health checks.
9. Clear failure reporting.
10. Versioned releases where practical.
11. A rollback strategy.
12. Concurrency protection against conflicting deployments.
13. Basic observability and monitoring.
14. Minimal permissions for deployment credentials.

The implementation intentionally avoids adding unnecessary infrastructure that is outside the scope of the assessment.

---

4. Backend CI/CD Pipeline

The backend workflow is:

.github/workflows/backend.yml

The pipeline follows this flow:

Pull Request
     |
     v
Checkout
     |
     v
Install dependencies
     |
     v
Lint
     |
     v
Test
     |
     v
Build
     |
     v
Merge to main
     |
     v
Create deployment artifact
     |
     v
Upload artifact to S3
     |
     v
Deploy to EC2 using AWS SSM
     |
     v
Restart application
     |
     v
Health check
     |
     +---- failure ----> Deployment fails
     |
     v
Production

---

4.1 Backend CI

For every pull request that changes backend code, the pipeline performs:

Dependency installation

npm ci

"npm ci" is used instead of "npm install" because it provides deterministic installation based on the lock file.

Linting

If the project defines a lint script, it is executed.

Tests

The backend test suite is executed before deployment.

Build

The backend is built when a build script is provided.

A failure in any of these stages prevents production deployment.

---

5. Backend Deployment

A successful push to "main" triggers the production deployment.

The deployment creates a release associated with the Git commit SHA.

For example:

/opt/backend/
├── current -> releases/a1b2c3d
└── releases/
    ├── a1b2c3d
    ├── 1234567
    └── 9876543

The "current" symlink points to the active release.

This allows releases to remain available for rollback.

---

5.1 Artifact storage

The deployment artifact is uploaded to S3 using the Git commit SHA.

Example:

s3://backend-artifacts/backend/a1b2c3d/backend.tar.gz

Using the commit SHA makes the artifact traceable to an exact source revision.

---

5.2 EC2 deployment

AWS Systems Manager is used to execute the deployment on the EC2 instance.

This avoids requiring GitHub Actions to maintain an SSH private key.

The deployment process is:

GitHub Actions
      |
      v
S3 artifact
      |
      v
AWS Systems Manager
      |
      v
EC2
      |
      v
Download artifact
      |
      v
Extract release
      |
      v
Update current symlink
      |
      v
Restart backend service
      |
      v
Health check

---

5.3 Backend health check

After restarting the backend, the deployment verifies an HTTP health endpoint.

For example:

GET http://localhost:3000/health

The deployment is considered successful only if the endpoint returns a successful response.

If the health check fails, the GitHub Actions job fails.

This prevents a deployment from being considered successful simply because the EC2 command itself completed.

---

6. Frontend CI/CD Pipeline

The frontend workflow is:

.github/workflows/frontend.yml

The pipeline follows this flow:

Pull Request
     |
     v
Checkout
     |
     v
Install dependencies
     |
     v
Lint
     |
     v
Test
     |
     v
Build SPA
     |
     v
Merge to main
     |
     v
Build production assets
     |
     v
Upload to S3
     |
     v
Verify deployment
     |
     v
Production

---

7. Frontend CI

For pull requests, the frontend pipeline:

1. Checks out the repository.
2. Installs the required Node.js version.
3. Runs "npm ci".
4. Runs linting when available.
5. Runs tests when available.
6. Builds the production SPA.

A failed build or test prevents deployment.

---

8. Frontend Deployment to S3

After a successful push to "main", the frontend production build is uploaded to the configured S3 bucket.

Example:

aws s3 sync frontend/dist s3://frontend-production --delete

The "--delete" option ensures that files removed from the application are also removed from the deployed bucket.

The deployment is therefore a synchronization of the complete production build rather than a collection of manually copied files.

---

9. Frontend Caching

For a real production deployment, caching should be considered carefully.

Static assets with content hashes can have long cache lifetimes.

For example:

app.abc123.js
app.456def.css

These files can safely be cached for a long period because their names change when their contents change.

The SPA entry point, usually:

index.html

should normally have a much shorter cache lifetime so that users receive the latest application version.

If CloudFront is used, the deployment pipeline can additionally invalidate:

/index.html

after deployment.

---

10. GitHub Actions Security

The workflows use:

permissions:
  contents: read

This follows the principle of granting the GitHub Actions job only the permissions it needs.

AWS credentials are never hardcoded into workflow files.

They are supplied through GitHub Actions secrets or, preferably in a real production environment, through OIDC.

---

11. Production Environment Protection

The deployment jobs use the GitHub Environment:

production

The production environment can be configured with:

- required reviewers;
- protected branches;
- environment-specific secrets;
- deployment restrictions.

This provides an additional safety mechanism before production deployment.

For a small team, automatic deployment to production may be appropriate.

For a higher-risk system, I would require manual approval before the deployment job proceeds.

---

12. Concurrency

Both workflows use GitHub Actions concurrency.

The purpose is to prevent two production deployments of the same application from modifying production simultaneously.

For example:

Deployment A
     |
     v
Production deployment running

Deployment B
     |
     v
Waits instead of modifying the same environment concurrently

I deliberately use:

cancel-in-progress: false

for production deployments.

A deployment that has already started should not normally be terminated abruptly simply because another commit was pushed.

---

13. Rollback Strategy

Backend

The backend uses versioned release directories.

For example:

/opt/backend/releases/
    abc123/
    def456/
    789abc/

The active release is selected using:

/opt/backend/current

If a deployment is found to be faulty, the previous release can be restored by changing the symlink back to the previous known-good release.

Example:

ln -sfn /opt/backend/releases/def456 /opt/backend/current
systemctl restart backend

The application can then be health checked again.

---

Frontend

Frontend releases can also be stored using versioned S3 prefixes if stronger rollback guarantees are required.

For example:

s3://frontend-production/releases/abc123/
s3://frontend-production/releases/def456/

A production deployment can then point the active distribution to a known release.

If CloudFront is used, rollback can also be implemented by restoring the previous release and invalidating the relevant cache paths.

---

14. Monitoring and Alerts

A production CI/CD system should not rely only on GitHub Actions for observability.

Backend monitoring

I would monitor:

- HTTP 5xx rate;
- HTTP latency;
- request rate;
- application health;
- EC2 CPU usage;
- EC2 memory usage;
- disk usage;
- application logs;
- systemd service status;
- deployment failures;
- restart frequency.

Alerts should be generated for:

- sustained 5xx errors;
- high latency;
- unhealthy application instances;
- excessive restarts;
- disk exhaustion;
- failed deployments.

---

Frontend monitoring

I would monitor:

- S3 availability;
- CloudFront 4xx responses;
- CloudFront 5xx responses;
- CloudFront latency;
- cache hit ratio;
- deployment failures;
- GitHub Actions failures.

For a real user-facing application, synthetic monitoring should also periodically request the public frontend URL.

---

CI/CD monitoring

I would track:

- workflow success rate;
- workflow duration;
- deployment duration;
- deployment failure rate;
- rollback frequency;
- time between deployment and incident.

---

15. Testing Strategy

The CI pipeline should contain multiple layers of validation.

Unit tests

Test individual application components.

Integration tests

Verify interactions between important application components.

Build validation

Ensure that both applications can be successfully built.

Deployment smoke tests

After deployment, perform a basic health check.

For example:

Backend:
GET /health

Frontend:
GET /

A production deployment should not be considered successful until these checks pass.

---

16. What I Deliberately Left Out

The assessment does not require provisioning the AWS infrastructure itself.

Therefore, I deliberately did not implement:

- EC2 creation;
- VPC creation;
- subnet configuration;
- security group creation;
- IAM infrastructure provisioning;
- S3 bucket creation;
- CloudFront distribution creation;
- Route 53 configuration;
- TLS certificate provisioning;
- database provisioning;
- autoscaling;
- load balancers;
- Terraform infrastructure.

These could be managed separately using Infrastructure as Code.

The focus of this task is the CI/CD pipeline rather than the complete AWS infrastructure.

---

17. Why I Did Not Use SSH for EC2 Deployment

A common implementation would be:

GitHub Actions
      |
      v
SSH
      |
      v
EC2

I intentionally use AWS Systems Manager instead.

This avoids maintaining an SSH private key inside GitHub Actions and reduces the number of exposed network access paths.

The EC2 instance can remain without an inbound SSH requirement for CI/CD deployment.

The EC2 instance uses an IAM role to communicate with AWS services.

---

18. AWS Permissions

The deployment identity should use least-privilege permissions.

For example, the backend deployment identity should only have access to:

- the required backend artifact bucket;
- the required SSM deployment operation.

The frontend deployment identity should only have access to:

- the specific frontend S3 bucket;
- the required S3 object operations.

In a real environment, I would use separate IAM roles for backend and frontend deployment rather than one broad deployment identity.

---

19. Recommended Production Improvements

For a larger production system, I would additionally implement:

1. GitHub Actions OIDC with AWS IAM.
2. Automated dependency scanning.
3. Secret scanning.
4. SAST.
5. Container/image scanning where applicable.
6. Infrastructure as Code using Terraform.
7. CloudWatch dashboards and alarms.
8. Automated rollback.
9. Blue/green or canary deployments for the backend.
10. Separate staging and production environments.
11. Automated smoke tests after deployment.
12. S3 lifecycle policies for old artifacts.
13. CloudFront in front of the frontend S3 bucket.
14. Versioned frontend releases for fast rollback.

---

20. Final Deployment Design

The final design is intentionally simple:

Backend

GitHub
   |
   | Pull Request
   v
CI: Install → Lint → Test → Build
   |
   | Merge to main
   v
Create release
   |
   v
S3 artifact storage
   |
   v
AWS Systems Manager
   |
   v
EC2
   |
   v
Restart service
   |
   v
Health check
   |
   v
Production

Frontend

GitHub
   |
   | Pull Request
   v
CI: Install → Lint → Test → Build
   |
   | Merge to main
   v
Build production SPA
   |
   v
S3
   |
   v
CloudFront (recommended)
   |
   v
Users

This design replaces the existing manual deployment process with repeatable, auditable and automated CI/CD pipelines while keeping the deployment architecture appropriate for the two different application types.