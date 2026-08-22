
# Problem 5: Fortify The Castle

## 1. Overview

This solution takes the architecture designed in Problem 1 and integrates security directly into the system architecture.

Security is treated as part of every layer of the system rather than as a separate security layer added at the end.

The main security priorities are:

1. Protect user accounts and authentication credentials.
2. Protect trading and financial operations.
3. Protect customer and trading data.
4. Reduce the attack surface of the infrastructure.
5. Limit the blast radius if a component is compromised.
6. Detect and investigate security incidents.
7. Maintain high availability while applying security controls.

---

# 2. Updated Secure Architecture

The following diagram shows the security changes added to the original Problem 1 architecture.

Security-related additions are marked with `[SECURITY]`.

```mermaid
flowchart TB

    Users["Users / Trading Clients"]

    Route53["Route 53"]

    Shield["[SECURITY] AWS Shield"]
    WAF["[SECURITY] AWS WAF"]

    ALB["Application Load Balancer"]

    subgraph VPC["AWS VPC"]

        subgraph Public["Public Subnets"]
            ALB
        end

        subgraph PrivateApp["Private Application Subnets"]
            API1["Trading API"]
            API2["Trading API"]
            Worker["Order/Event Workers"]
        end

        subgraph PrivateData["Private Database Subnets"]
            DB["RDS / Aurora"]
            Redis["ElastiCache Redis"]
        end

        Queue["SQS / EventBridge"]
    end

    Auth["[SECURITY] Authentication / Identity Provider"]
    Secrets["[SECURITY] AWS Secrets Manager"]
    KMS["[SECURITY] AWS KMS"]
    IAM["[SECURITY] IAM / Least Privilege"]
    SG["[SECURITY] Security Groups"]

    CloudTrail["[SECURITY] AWS CloudTrail"]
    GuardDuty["[SECURITY] GuardDuty"]
    Config["[SECURITY] AWS Config"]
    SecurityHub["[SECURITY] Security Hub"]
    Logs["[SECURITY] CloudWatch / Centralized Logs"]

    CICD["CI/CD Pipeline"]
    ECR["Amazon ECR"]

    Users --> Route53
    Route53 --> Shield
    Shield --> WAF
    WAF --> ALB

    ALB --> API1
    ALB --> API2

    Users -. Authentication .-> Auth
    Auth -. Access Token .-> API1
    Auth -. Access Token .-> API2

    API1 --> Worker
    API2 --> Worker

    API1 --> DB
    API2 --> DB

    API1 --> Redis
    API2 --> Redis

    Worker --> Queue
    Worker --> DB

    API1 -. Secrets .-> Secrets
    API2 -. Secrets .-> Secrets
    Worker -. Secrets .-> Secrets

    Secrets --> KMS
    DB --> KMS
    Redis --> KMS

    IAM -. IAM Policies .-> API1
    IAM -. IAM Policies .-> API2
    IAM -. IAM Policies .-> Worker
    IAM -. IAM Policies .-> Secrets

    SG -. Network Isolation .-> ALB
    SG -. Network Isolation .-> API1
    SG -. Network Isolation .-> API2
    SG -. Network Isolation .-> DB
    SG -. Network Isolation .-> Redis

    ALB --> Logs
    API1 --> Logs
    API2 --> Logs
    DB --> Logs

    CloudTrail --> SecurityHub
    GuardDuty --> SecurityHub
    Config --> SecurityHub
    SecurityHub --> Logs

    CICD --> ECR
    ECR --> API1
    ECR --> API2


---

3. Network Security

3.1 VPC Isolation

The system runs inside an AWS VPC with separate public, application, and database tiers.

Internet
   |
   v
AWS Shield
   |
   v
AWS WAF
   |
   v
Application Load Balancer
   |
   v
Private Application Subnets
   |
   v
Private Database Subnets

Only the Application Load Balancer is exposed to the public Internet.

Application servers and databases are placed in private subnets.

Why

This reduces the attack surface and prevents attackers from directly accessing application servers or databases.

Threats protected against

Direct database attacks

Port scanning

Unauthorized network access

Lateral movement after a server compromise

Accidental public exposure



---

4. Security Groups

Security Groups will follow the principle of least privilege.

Example:

Internet
   |
   | HTTPS :443
   v
ALB Security Group
   |
   | Application traffic
   v
Application Security Group
   |
   | Database port only
   v
Database Security Group

The database Security Group will only accept traffic from the Application Security Group.

The database will not allow unrestricted Internet access.

For example:

ALB SG
  -> Application SG

Application SG
  -> Database SG
  -> Redis SG

Why

If an application server is compromised, network restrictions reduce the attacker's ability to move to other components.


---

5. AWS WAF

AWS WAF will be placed in front of the Application Load Balancer.

Internet
   |
   v
AWS Shield
   |
   v
AWS WAF
   |
   v
ALB

WAF will provide protection against common web attacks such as:

SQL injection

Cross-site scripting

Malformed requests

Automated attacks

Excessive request rates


Rate-based rules will also be applied to sensitive endpoints.

Examples:

/login
/register
/order
/withdrawal
/api-key

These endpoints should have stricter rate limits than ordinary read-only APIs.

Why

A trading platform is Internet-facing and therefore exposed to automated attacks and application-layer attacks.


---

6. DDoS Protection

AWS Shield will protect the public entry point.

The initial architecture is:

Route 53
   |
   v
AWS Shield
   |
   v
AWS WAF
   |
   v
ALB

AWS Shield Advanced can be considered if the business requires stronger DDoS protection.

Trade-off

Shield Advanced adds cost and operational considerations.

For the initial design, standard protection is sufficient unless business requirements indicate otherwise.


---

7. Authentication

Users must authenticate before accessing account and trading functionality.

A dedicated identity provider should be used instead of implementing password storage directly inside the trading application.

Example:

User
 |
 v
Identity Provider
 |
 | Access Token
 v
Trading API

AWS Cognito can be used if it fits the application's authentication requirements.

Passwords must never be stored in plaintext.

Passwords and authentication tokens must never be written to logs.


---

8. Multi-Factor Authentication

MFA should be required for sensitive operations.

Examples:

Login from a new device

Changing account security settings

Creating or deleting API keys

Withdrawal operations

High-risk account operations

Administrative access


MFA is mandatory for privileged administrators.

Why

Passwords alone are not sufficient protection for accounts controlling financial assets.


---

9. Authorization

Authentication determines who the user is.

Authorization determines what the user is allowed to do.

Authorization must always be enforced on the server side.

Example:

User A
 |
 +-- Can access User A account
 |
 X-- Cannot access User B account

The frontend must never be trusted to enforce authorization.

Every sensitive request should follow:

Authenticate
     |
     v
Authorize
     |
     v
Validate request
     |
     v
Execute operation


---

10. Trading and Financial Operations

Trading operations require stronger validation because they can have financial consequences.

For example:

Create Order
     |
     v
Authenticate User
     |
     v
Authorize Account
     |
     v
Validate Symbol
     |
     v
Validate Quantity / Price
     |
     v
Validate Balance / Limits
     |
     v
Create Order
     |
     v
Persist Transaction

The server must never trust client-provided:

Account ID

Balance

Permissions

Trading limits

Security checks


All important business rules must be validated on the server.


---

11. Idempotency

Financial operations should support idempotency where appropriate.

Example:

POST /orders
Idempotency-Key: abc123

If a client retries the request because of a network timeout, the system should not accidentally create multiple identical orders.

Why

This protects against:

Network retries

Client retries

Duplicate requests

Load balancer retries


This is especially important for financial operations.


---

12. Database Security

The database will run inside private database subnets.

It must not have direct public Internet access.

Internet
   X
   |
   X
Database

Application
    |
    v
Database

Database security includes:

Encryption at rest

Encryption in transit

Automated backups

Point-in-time recovery

Restricted access

Strong credentials

Database auditing where required



---

13. Encryption at Rest

Sensitive data will be encrypted at rest.

AWS KMS will be used for key management.

Examples:

RDS
 |
 v
KMS

Secrets Manager
 |
 v
KMS

Encryption should cover:

Database storage

Backups

Sensitive application data

Secrets where supported

Other sensitive storage


Encryption keys must never be hard-coded into application source code.


---

14. Encryption in Transit

All external traffic must use HTTPS/TLS.

Client
  |
  | HTTPS
  v
AWS WAF
  |
  | HTTPS
  v
ALB
  |
  v
Application

TLS should also be used for internal connections where the threat model or compliance requirements justify it.


---

15. Secrets Management

Secrets must never be stored in:

Source code
GitHub
Docker images
Committed .env files
README files
CI/CD logs

AWS Secrets Manager will be used instead.

Example:

Application
     |
     v
AWS Secrets Manager
     |
     +-- Database credentials
     +-- API credentials
     +-- Third-party secrets

Applications retrieve secrets at runtime using IAM permissions.


---

16. IAM Least Privilege

Each workload should have its own IAM role.

For example:

Trading API Role
    |
    +-- Read required secrets
    +-- Write required logs
    +-- Access required queues

Worker Role
    |
    +-- Read queue
    +-- Write required database data
    +-- Read required secrets

The application must not have unrestricted administrator permissions.

Policies such as:

Action: *
Resource: *

should be avoided unless there is a documented and justified exception.

Why

If an application is compromised, least-privilege IAM limits the attacker's access to AWS resources.


---

17. Administrative Access

Production servers should not expose unrestricted SSH access to the Internet.

AWS Systems Manager Session Manager should be preferred where possible.

The preferred model is:

Administrator
      |
      v
IAM + MFA
      |
      v
AWS Systems Manager
      |
      v
Private Instance

Privileged access should be logged and auditable.


---

18. Audit Logging

AWS CloudTrail will be enabled to record AWS API activity.

Important events include:

IAM changes

Security Group changes

KMS operations

Infrastructure changes

Production configuration changes


Application audit logs should also record important business events.

Examples:

User login
Order creation
Order cancellation
API key creation
Withdrawal request
Permission changes
Administrative actions


---

19. Protecting Logs

Logs are also sensitive.

The application must never log:

Passwords
Access tokens
Private API keys
Encryption keys
Secret credentials
Sensitive payment credentials

Logs should have:

Encryption

Access control

Retention policies

Centralized storage

Monitoring



---

20. GuardDuty and Security Hub

AWS GuardDuty will be enabled for threat detection.

It can help identify suspicious activity such as:

Credential compromise

Suspicious network activity

Unexpected AWS API activity

Potentially compromised resources


Security Hub can aggregate security findings.

Architecture:

CloudTrail
     |
     v
GuardDuty
     |
     v
Security Hub
     |
     v
Security Alerts


---

21. AWS Config

AWS Config will be used to detect insecure configuration and configuration drift.

Examples of policies:

Database must not be public
Sensitive ports must not be open to the Internet
Encryption must be enabled
Required logging must be enabled
Required security settings must be enabled

Example scenario:

Developer accidentally exposes database
              |
              v
AWS Config detects violation
              |
              v
Security alert


---

22. CI/CD Security

Security checks will be integrated into the CI/CD pipeline.

Source Code
    |
    v
Unit Tests
    |
    v
Dependency Scan
    |
    v
Secret Scan
    |
    v
SAST
    |
    v
Container Scan
    |
    v
Build
    |
    v
Deploy

The pipeline should include:

Dependency vulnerability scanning

Static Application Security Testing

Secret scanning

Container image scanning

Infrastructure-as-Code security scanning


Critical vulnerabilities should block production deployment when appropriate.


---

23. Container Security

If containers are used, images should be stored in Amazon ECR.

Container images should:

Use minimal base images

Avoid unnecessary packages

Run as a non-root user where possible

Be regularly rebuilt

Be scanned for vulnerabilities


Only trusted images should be deployed to production.


---

24. Input Validation

All external input must be considered untrusted.

Examples:

Symbol
Quantity
Price
Account ID
Order type
Pagination
Search parameters

Validation must happen server-side.

Database queries must use parameterized queries instead of constructing SQL statements directly from user input.


---

25. Rate Limiting

Rate limiting should be applied at multiple layers.

Edge layer

AWS WAF rate-based rules.

Application layer

Per-user and per-API-key limits.

Sensitive operations

Stricter limits for:

Login
Password reset
API key creation
Order creation
Withdrawal

Threats protected against

Brute force attacks

Credential stuffing

API abuse

Denial-of-service attacks

Automated trading abuse



---

26. Backup Security

Backups are also sensitive data.

Backups should therefore be:

Encrypted

Access-controlled

Retained according to policy

Tested through regular restore exercises


A backup is not considered reliable until restoration has been tested.

Example:

Backup
  |
  v
Restore
  |
  v
Validate Data
  |
  v
Measure Recovery Time


---

27. High Availability

Security controls must not introduce unnecessary single points of failure.

The application should run across multiple Availability Zones.

Internet
                    |
                    v
              WAF / ALB
                    |
          +---------+---------+
          |                   |
          v                   v
       API #1              API #2
          |                   |
          +---------+---------+
                    |
                    v
              Database Layer

This preserves the high-availability objective from Problem 1.


---

28. What I Would Refuse To Ship Without

The following are production blockers.

1. No authentication

I would not ship the platform.

2. Broken authorization

I would not ship if one user could access another user's account or execute unauthorized trading operations.

3. Public database

I would not ship a production trading platform with a publicly accessible database.

4. Secrets stored in source control

I would not ship with passwords, API keys, or other secrets committed to GitHub.

5. Missing encryption

I would not ship without encryption for sensitive data.

6. No audit trail for financial operations

I would not ship without the ability to determine who performed important financial actions.

7. No backup and recovery strategy

I would not ship a financial system without a reliable and tested recovery mechanism.

8. No protection for public APIs

I would not expose the production API without basic WAF, rate limiting, and DDoS protection.

9. Unrestricted administrative access

Production administrative access must use strong authentication and be auditable.


---

29. What I Would Deliberately Leave Out

Not every security feature needs to be implemented immediately.

I would deliberately defer the following:

Multi-region Active/Active

Multi-region active/active introduces significant complexity around:

Data replication

Order consistency

Failover

Conflict resolution

Operational complexity

Cost


For the initial architecture, I would use multiple Availability Zones within one region.

I would introduce multi-region architecture if the required RTO/RPO justifies it.


---

Extensive Custom WAF Rules

I would initially use AWS managed rules and rate limiting.

Custom rules would be introduced based on real traffic and observed attacks.

Trade-off

Aggressive WAF rules can cause false positives and block legitimate trading traffic.


---

Advanced Behavioral Detection

Advanced behavioral analytics can be introduced after the basic security controls are operational.

The initial priority is:

Authentication
Authorization
Network Isolation
Encryption
Secrets Management
Audit Logging
Threat Detection


---

Full Service Mesh / Extreme Micro-Segmentation

I would not introduce a highly complex service mesh or hundreds of network rules without a clear requirement.

The additional operational complexity may create more risk than it removes at the initial scale.


---

30. Accepted Risks

Risk 1: Single Region

The initial architecture is multi-AZ but single-region.

Risk

A major regional AWS outage could affect the platform.

Decision

Accept temporarily.

Reason

Multi-region trading introduces significant consistency and operational complexity.

This should be revisited when RTO/RPO requirements are defined.


---

Risk 2: Basic WAF Rules Initially

Risk

Some sophisticated application-layer attacks may not be detected immediately.

Decision

Accept temporarily.

Reason

Start with AWS managed rules and rate limiting, then tune based on real traffic.


---

Risk 3: Advanced Threat Detection Deferred

Risk

Some sophisticated attacks may take longer to detect.

Decision

Accept temporarily.

Reason

Core controls such as authentication, authorization, network isolation, encryption, and audit logging have higher priority.


---

31. Information I Still Need

Some security decisions require additional business and technical information.

Data Classification

I need to know:

What customer data is stored?

Is personally identifiable information stored?

Is payment information stored?

What financial information is considered sensitive?


How I would obtain it

I would review:

Database schema

Data model

Product requirements

Data classification policy

Compliance requirements



---

Compliance Requirements

I would ask whether the platform must comply with:

PCI DSS

SOC 2

GDPR

Local financial regulations

Internal security standards


The exact requirements may change the security architecture.


---

RTO and RPO

I need to know:

RTO = How long can the system be unavailable?

RPO = How much data loss is acceptable?

These requirements determine whether multi-region disaster recovery is required.


---

Threat Model

I would ask:

Who are the expected attackers?

What countries/regions are supported?

What is the expected traffic volume?

Are customer API keys supported?

Are withdrawals supported?

Which users have administrative privileges?


I would document the answers and update the architecture accordingly.


---

32. Security Assumptions

Until the missing requirements are available, I assume:

1. The platform is Internet-facing.


2. Users can create accounts and trade.


3. Financial transactions are highly sensitive.


4. The platform requires high availability.


5. Customer data is confidential.


6. Administrators are privileged users.


7. AWS is the only cloud provider.


8. The initial deployment is single-region and multi-AZ.


9. Production credentials must not be stored in source control.


10. External traffic uses HTTPS.



These assumptions should be reviewed when the actual requirements are provided.


---

33. Incident Response

Security controls are incomplete without an incident response process.

The response process should be:

Detection
   |
   v
Triage
   |
   v
Containment
   |
   v
Investigation
   |
   v
Eradication
   |
   v
Recovery
   |
   v
Post-Incident Review

Example:

Suspicious Login
      |
      v
Detection
      |
      v
Disable / Lock Compromised Credential
      |
      v
Investigate Logs
      |
      v
Rotate Affected Secrets
      |
      v
Recover Trusted State
      |
      v
Post-Incident Review


---

34. Secret Rotation

If a credential is suspected to be compromised:

Detect Compromise
      |
      v
Identify Affected Secret
      |
      v
Rotate Secret
      |
      v
Deploy New Credential
      |
      v
Revoke Old Credential
      |
      v
Investigate Access Logs

Secrets should not be manually copied between servers.


---

35. Security Monitoring

I would create alerts for:

Repeated failed logins
Unusual authentication activity
Unexpected IAM changes
Security Group changes
Public resource exposure
Large API traffic spikes
Large increase in 4xx / 5xx responses
Unusual order activity
Unexpected administrative actions
Database access anomalies
Secret access anomalies

Centralized logs should be used so that attackers cannot easily hide activity by modifying logs on a compromised server.


---

36. Security Principles

The final architecture follows several principles.

Least Privilege

Every user, service, and role receives only the permissions required.

Defense in Depth

No single security control is expected to stop every attack.

WAF
 |
Network Isolation
 |
Authentication
 |
Authorization
 |
Input Validation
 |
Database Security
 |
Audit Logging
 |
Threat Detection

Secure by Default

New infrastructure should start with secure defaults.

Assume Breach

I assume that one component may eventually become compromised.

Network segmentation and least-privilege IAM therefore limit the attacker's movement.

Minimize Blast Radius

A compromised application should not automatically gain access to:

All AWS resources

All databases

All secrets

Other environments



---

37. Summary of Architecture Changes

Problem 1 Component	Security Change	Purpose

Route 53	Keep + secure DNS configuration	Secure entry point
ALB	HTTPS + restricted Security Groups	Secure traffic termination
Public API	WAF + rate limiting	Protect public API
Application	Private subnet	Reduce attack surface
Database	Private subnet + Security Group + encryption	Protect sensitive data
Redis	Private network + encryption	Protect cached data
Secrets	AWS Secrets Manager	Prevent credential leakage
Encryption	AWS KMS	Centralized key management
IAM	Least-privilege roles	Limit compromise impact
Logging	CloudWatch / centralized logs	Monitoring and investigation
AWS API activity	CloudTrail	Infrastructure auditing
Threat detection	GuardDuty	Detect suspicious activity
Configuration	AWS Config	Detect configuration drift
Findings	Security Hub	Centralize security findings
CI/CD	Security scanning	Prevent vulnerable deployments
Admin access	SSM + MFA	Protect privileged access



---

38. Final Security Decision

The most important security changes are architectural boundaries rather than individual security products.

The system is protected through multiple layers:

INTERNET
                       |
                       v
                AWS Shield / WAF
                       |
                       v
                      ALB
                       |
             ---------------------
             |                   |
             v                   v
          API #1              API #2
             |                   |
             +---------+---------+
                       |
                Least Privilege
                       |
              ------------------
              |                |
              v                v
          Database           Redis
          [Private]          [Private]
              |
             KMS
              |
       Encrypted Sensitive Data

Across the entire architecture:

IAM
Secrets Manager
CloudTrail
GuardDuty
AWS Config
Security Hub
Centralized Logging
Monitoring

This means security is integrated into the architecture instead of being treated as a separate checklist.


---

39. Conclusion

The highest security priorities for this trading platform are:

1. Strong authentication and MFA


2. Server-side authorization


3. Private network architecture


4. Least-privilege IAM


5. Secrets management


6. Encryption


7. WAF and rate limiting


8. Audit logging


9. Threat detection


10. Secure CI/CD


11. Reliable backup and recovery



I would refuse to ship without strong authentication, authorization, network isolation, secrets protection, encryption, financial-operation auditing, and a tested recovery strategy.

I would deliberately defer more complex controls such as multi-region active/active architecture, advanced behavioral analytics, and extensive custom WAF rules until the business requirements and real-world traffic patterns justify their complexity.

The core principle is:

> Security should reduce both the probability and the impact of compromise while keeping the system practical to operate.