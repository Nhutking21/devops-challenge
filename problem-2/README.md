
Problem 2: Diagnose Me Doctor

1. Problem Overview

We have an Ubuntu 24.04 VM with:

- 64 GB storage
- NGINX as the only application
- NGINX is used as a load balancer / traffic router for upstream services
- Monitoring reports that disk usage is consistently around 99%

The primary concern is that the VM may eventually run out of disk space.

A full filesystem can cause:

- NGINX to fail writing access/error logs
- NGINX configuration reloads to fail
- Temporary files to fail to create
- System services to malfunction
- Package updates to fail
- SSH sessions or other OS operations to behave unexpectedly
- NGINX to stop accepting or processing traffic correctly
- Upstream services to become unreachable through the load balancer

The first objective is therefore to identify which filesystem is full and what is consuming the space, while avoiding destructive actions in production.

---

2. Troubleshooting Approach

I would troubleshoot the problem in the following sequence:

Monitoring Alert
       |
       v
Confirm disk usage
       |
       v
Check filesystem / mount
       |
       +----> Disk blocks full?
       |
       +----> Inodes full?
       |
       v
Identify largest directories
       |
       v
Identify largest files
       |
       v
Determine file owner/process
       |
       v
Check NGINX logs
       |
       v
Check systemd journal
       |
       v
Check deleted-but-open files
       |
       v
Identify root cause
       |
       v
Recover safely
       |
       v
Prevent recurrence

The key principle is:

«Do not immediately delete large files before determining why they became large.»

Deleting the wrong file can cause data loss or application problems.

---

3. Step 1 — Confirm the Alert

First, I would verify that the monitoring alert reflects the actual filesystem state.

df -h

Example:

Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2        64G   63G  1.0G  99% /

I would also check all mounted filesystems:

df -hT

This tells me:

- Filesystem
- Filesystem type
- Total size
- Used space
- Available space
- Mount point

I would confirm whether "/" is actually the filesystem that is 99% full.

---

4. Step 2 — Check Inode Usage

Disk usage can be high because of either:

1. Large files consuming disk blocks
2. A huge number of small files consuming inodes

Therefore I would also run:

df -ih

Example:

Filesystem      Inodes IUsed IFree IUse% Mounted on
/dev/sda2        4.0M  3.9M  100K   98% /

If inode usage is close to 100% while block usage is lower, the problem is likely a large number of small files rather than a few large files.

This distinction is important because the troubleshooting path is different.

---

5. Step 3 — Find the Largest Directories

I would start at the root filesystem and identify which directories consume the most space.

sudo du -xhd1 / 2>/dev/null | sort -h

The "-x" option is important because it prevents "du" from crossing into other mounted filesystems.

Example:

1.2G    /usr
2.5G    /home
5.8G    /var
52G     /var/log
63G     /

If "/var" is unusually large, I would continue:

sudo du -xhd1 /var 2>/dev/null | sort -h

Then:

sudo du -xhd1 /var/log 2>/dev/null | sort -h

This allows me to progressively narrow down the source.

---

6. Step 4 — Find Large Files

Once I identify the problematic directory, I would locate the largest files.

For example:

sudo find /var -xdev -type f -printf '%s %p\n' 2>/dev/null \
  | sort -n \
  | tail -20

Alternatively, for a quick human-readable inspection:

sudo du -ahx /var 2>/dev/null | sort -h | tail -30

I would pay particular attention to:

/var/log/nginx/
/var/log/journal/
/var/log/
/tmp/
/var/tmp/
/var/crash/

---

7. Step 5 — Check NGINX Logs

Because this VM exists primarily to run NGINX as a load balancer, NGINX logs are one of the first things I would investigate.

Typical locations are:

/var/log/nginx/access.log
/var/log/nginx/error.log

Check their sizes:

sudo ls -lh /var/log/nginx/

Then inspect the largest files:

sudo du -ah /var/log/nginx | sort -h

I would inspect the recent log content:

sudo tail -100 /var/log/nginx/access.log
sudo tail -100 /var/log/nginx/error.log

I would also check the NGINX configuration:

sudo nginx -T

This helps determine:

- Which logs are configured
- Whether custom log paths are being used
- Whether upstreams are producing repeated errors
- Whether logging configuration is unexpectedly verbose

---

8. Root Cause Scenario 1 — NGINX Access Logs Growing Rapidly

Symptoms

The most likely scenario is that NGINX access logs are consuming most of the disk.

For example:

/var/log/nginx/access.log      45 GB
/var/log/nginx/error.log        8 GB
Other files                     10 GB
------------------------------------
Total                           ~63 GB

This can happen if the load balancer receives very high request volume or if log rotation is not working correctly.

Another possibility is malicious or unexpected traffic causing an unusually high number of requests.

---

How I Would Confirm It

Check file sizes:

sudo ls -lh /var/log/nginx/

Check log rotation:

ls -l /etc/logrotate.d/nginx

Run a safe logrotate test:

sudo logrotate -d /etc/logrotate.d/nginx

The "-d" option performs a debug/dry run and does not actually rotate the logs.

I would also inspect whether old rotated logs are accumulating:

sudo ls -lah /var/log/nginx/

For example:

access.log
access.log.1
access.log.2.gz
access.log.3.gz
access.log.4.gz
...

If there are many large uncompressed historical logs, log rotation or retention may be incorrectly configured.

---

9. Impact of NGINX Log Growth

If the filesystem reaches 100%:

Disk
 |
 +-- Available space -> 0

NGINX may be unable to write new log entries.

More importantly, other operations requiring filesystem writes may fail.

Potential consequences include:

- NGINX reload failures
- Temporary file creation failures
- System services failing to write state
- Package management failures
- Monitoring agents failing
- Unexpected application behavior

For a load balancer, the ultimate impact could be loss of traffic-routing capability.

---

10. Recovery — NGINX Log Growth

The recovery should avoid blindly deleting the active log file.

First, I would confirm the immediate disk pressure and determine whether there is enough free space to perform a normal rotation.

If log rotation is configured correctly, I would trigger it:

sudo logrotate -f /etc/logrotate.d/nginx

Then verify:

df -h
sudo ls -lh /var/log/nginx/

If old compressed logs are consuming excessive space, I would remove only logs that are outside the approved retention period.

For example:

sudo find /var/log/nginx -type f -name "*.gz" -mtime +30 -print

I would first inspect the files with "-print".

Only after confirming the retention policy would I delete them.

---

11. Important: Do Not Immediately Run "rm access.log"

A dangerous approach would be:

rm /var/log/nginx/access.log

while NGINX is still writing to the file.

This can result in a deleted file that is still held open by the NGINX process.

The disk space may therefore not actually be released.

Instead, I would use the existing log rotation mechanism or safely recreate/truncate logs according to the NGINX/logrotate configuration.

---

12. Prevention — NGINX Log Growth

I would verify that logrotate is correctly configured.

For example:

Daily rotation
Compression
Reasonable retention period
Missing log handling
Post-rotate NGINX reload/reopen

I would also monitor:

Disk usage %
Log directory size
Log growth rate
NGINX request rate
NGINX error rate

An alert should occur before the disk reaches 99%.

For example:

Warning: 80%
Critical: 90%
Emergency: 95%

The exact thresholds depend on the organization's operational policy.

---

13. Root Cause Scenario 2 — Deleted File Still Held Open by NGINX

A particularly important Linux troubleshooting scenario is a file that has been deleted but is still open by a running process.

For example:

NGINX
 |
 +-- access.log

Someone deletes the file:

rm access.log

The directory entry disappears, but NGINX still has the file descriptor open.

Linux continues to reserve the disk blocks until the process closes the file.

Therefore:

df -h

may report:

99% used

even though:

du -sh /

does not appear to account for the missing space.

---

14. How to Detect Deleted-but-Open Files

I would use:

sudo lsof +L1

Or:

sudo lsof | grep deleted

Example:

nginx   1234  www-data  5w  REG  8,1  21474836480  ... /var/log/nginx/access.log (deleted)

This means NGINX is still holding approximately 20 GB of disk space through an unlinked file.

This is a critical clue when:

df shows high usage
BUT
du cannot explain the usage

---

15. Impact of Deleted-but-Open Files

The main impact is that disk space remains unavailable even though the file appears to have been deleted.

If the process continues writing to the file, the amount of hidden disk usage can continue increasing.

Eventually:

Available disk space -> 0

This can cause the same production problems as normal disk exhaustion.

---

16. Recovery — Deleted-but-Open Files

The safest recovery is to make the owning process close the file descriptor.

For NGINX, I would first determine whether the file is an NGINX log.

Then I would perform a controlled log reopen/reload according to the deployment procedure.

For example:

sudo nginx -t

If the configuration is valid:

sudo systemctl reload nginx

Then verify:

sudo lsof +L1
df -h

If the descriptor was successfully closed, the disk space should be released.

If a reload does not release the descriptor, a controlled NGINX restart may be required:

sudo systemctl restart nginx

This should only be done according to the production change procedure because restarting the load balancer can temporarily affect traffic.

---

17. Root Cause Scenario 3 — systemd Journal Logs

Another possible cause is excessive systemd journal storage.

Check:

sudo journalctl --disk-usage

Example:

Archived and active journals take up 25.0G in the file system.

This could happen if:

- NGINX is repeatedly logging errors
- An upstream is continuously failing
- A system service is stuck in a restart loop
- Journal retention is too long
- Persistent logging has grown unexpectedly

---

18. Recovery — systemd Journal

First inspect recent errors:

sudo journalctl -p err -b

Check NGINX-related logs:

sudo journalctl -u nginx --since "1 hour ago"

If journal storage is excessive, vacuum according to the organization's retention policy.

For example:

sudo journalctl --vacuum-time=14d

or:

sudo journalctl --vacuum-size=2G

The exact retention policy should be agreed with the operations/security requirements rather than arbitrarily deleting logs.

---

19. Root Cause Scenario 4 — Core Dumps

Another possible cause is repeated application or service crashes generating core dump files.

Check:

sudo du -sh /var/lib/systemd/coredump 2>/dev/null

Also inspect:

sudo ls -lh /var/crash/

If core dumps are large and there are many of them, I would determine:

1. Which process is crashing
2. Why it is crashing
3. Whether the crash is related to NGINX or another system component

I would not simply delete all core dumps without first preserving evidence needed for debugging.

After collecting the required diagnostic information, old core dumps can be removed according to the retention policy.

---

20. Root Cause Scenario 5 — Temporary Files

Temporary directories can also consume disk space:

/tmp
/var/tmp

Check:

sudo du -xhd1 /tmp /var/tmp 2>/dev/null | sort -h

If large files are found, I would identify:

- Which process created them
- Whether they are still in use
- Whether they are safe to remove

I would avoid blindly running:

rm -rf /tmp/*

on a production server because active processes may still depend on temporary files.

---

21. Root Cause Scenario 6 — Inode Exhaustion

If:

df -h

looks acceptable but:

df -ih

shows:

IUse% = 100%

then the problem is not necessarily the number of gigabytes consumed.

The filesystem may contain millions of small files.

I would investigate directories such as:

/var/log
/tmp
/var/tmp
application cache directories

Find directories containing large numbers of files.

The recovery would involve safely removing obsolete small files according to the application's retention policy.

The prevention strategy would be:

- Log rotation
- File retention policies
- Monitoring inode usage
- Avoiding unbounded temporary-file creation

---

22. Root Cause Scenario 7 — Unexpected Traffic or Attack

Because NGINX is a public traffic router, unexpectedly high traffic could cause logs to grow rapidly.

I would inspect request rates and access logs.

For example:

sudo tail -1000 /var/log/nginx/access.log

Look for:

- One IP generating huge traffic
- Repeated requests to the same endpoint
- Large numbers of 404 responses
- Repeated malicious requests
- Unexpected user agents
- Traffic spikes
- Upstream error spikes

I would correlate this with monitoring metrics.

If malicious traffic is confirmed, mitigation could include:

- WAF/rate limiting upstream
- Network-level controls
- NGINX rate limiting
- Blocking abusive sources
- Reviewing upstream capacity

The immediate disk issue should still be addressed separately.

---

23. Root Cause Scenario 8 — Log Rotation Misconfiguration

Another likely cause is that logrotate exists but does not correctly rotate NGINX logs.

I would inspect:

cat /etc/logrotate.d/nginx

Then test:

sudo logrotate -d /etc/logrotate.d/nginx

I would verify:

- Rotation frequency
- Number of retained files
- Compression
- Ownership and permissions
- Post-rotate behavior
- Whether NGINX reopens the log files

I would also check whether logrotate itself is running correctly:

systemctl status logrotate.timer

Depending on the Ubuntu installation, the exact scheduling mechanism should be verified rather than assumed.

---

24. Root Cause Investigation Matrix

Root Cause| How to Detect| Impact| Recovery
NGINX access logs growing| "du", "ls -lh /var/log/nginx"| Disk exhaustion, NGINX issues| Rotate logs, remove expired logs
NGINX error logs growing| "du", "tail", "journalctl"| Disk exhaustion, possible upstream problem| Fix underlying error + rotate logs
Deleted-but-open files| "lsof +L1"| Disk remains consumed after deletion| Reload/restart owning process
systemd journal growth| "journalctl --disk-usage"| Disk exhaustion| Vacuum according to retention policy
Core dumps| "/var/lib/systemd/coredump", "/var/crash"| Large disk consumption| Investigate crash, archive/remove dumps
Temporary files| "du /tmp /var/tmp"| Disk exhaustion| Identify owner, safely clean stale files
Inode exhaustion| "df -ih"| Cannot create new files| Remove excessive small files
Logrotate failure| "logrotate -d", systemd status| Logs grow indefinitely| Fix rotation configuration
Unexpected traffic| NGINX logs + metrics| High log growth and traffic load| Rate limit / block / investigate traffic
Other large files| "du", "find"| Disk exhaustion| Identify owner before removal

---

25. Safe Emergency Recovery Procedure

If the disk reaches a critical level during production, I would prioritize restoring a safe amount of free space while minimizing service disruption.

The procedure would be:

Step 1 — Confirm

df -h
df -ih

Step 2 — Identify the filesystem

df -hT

Step 3 — Find large directories

sudo du -xhd1 / 2>/dev/null | sort -h

Step 4 — Find large files

sudo find /var -xdev -type f -printf '%s %p\n' 2>/dev/null \
  | sort -n | tail -20

Step 5 — Check deleted-but-open files

sudo lsof +L1

Step 6 — Check NGINX logs

sudo ls -lh /var/log/nginx/
sudo tail -100 /var/log/nginx/error.log

Step 7 — Check journal

sudo journalctl --disk-usage

Step 8 — Safely reclaim space

Depending on the root cause:

Rotate NGINX logs
Remove expired logs
Vacuum journal
Remove stale temporary files
Close deleted-but-open files
Remove obsolete core dumps

Step 9 — Verify

df -h
df -ih

Step 10 — Verify NGINX

sudo nginx -t
sudo systemctl status nginx

Then check traffic:

curl -I http://localhost

If the service is behind HTTPS or a specific listener, I would use the appropriate health-check endpoint instead.

---

26. What I Would NOT Do

In production, I would avoid immediately doing things such as:

rm -rf /var/log/*

or:

rm -rf /tmp/*

or:

rm -rf /var/cache/*

without understanding what owns the files.

I would also avoid restarting NGINX immediately unless necessary.

The goal is not simply:

«"Make "df -h" show a lower percentage."»

The goal is:

«"Recover disk capacity while preserving service availability and understanding why the disk filled."»

---

27. Verification After Recovery

After reclaiming disk space, I would verify:

Disk

df -h
df -ih

Target:

Healthy filesystem
Sufficient free space

NGINX

sudo nginx -t
sudo systemctl is-active nginx

Expected:

active

Logs

sudo ls -lh /var/log/nginx/

Verify that new logs are being written correctly.

Traffic

Check:

- Request rate
- HTTP 4xx/5xx
- Upstream errors
- p99 latency
- Load balancer health
- NGINX error rate

Deleted files

sudo lsof +L1

Verify that unexpected large deleted-but-open files are no longer consuming space.

---

28. Long-Term Prevention

The incident should not be considered resolved until the root cause is addressed.

I would implement the following controls.

Disk monitoring

Monitor:

Filesystem usage
Inode usage
Disk growth rate

For example:

Warning  >= 80%
Critical >= 90%
Emergency >= 95%

The exact thresholds should be adjusted according to workload and operational policy.

---

Log monitoring

Monitor:

NGINX access log growth
NGINX error log growth
systemd journal size

A sudden increase in log growth should trigger an alert before disk exhaustion.

---

Log rotation

Ensure NGINX logs have:

Rotation
Compression
Retention
Correct post-rotate behavior

---

Root cause monitoring

If NGINX error logs grow rapidly, investigate why.

For example:

NGINX
  |
  +-- upstream timeout
  +-- upstream connection refused
  +-- 5xx errors
  +-- client errors

A large log file can be a symptom of a deeper availability problem.

---

29. Incident Timeline Example

A production incident could look like this:

10:00
Disk usage = 80%

10:30
NGINX error rate increases

10:40
Error log begins growing rapidly

11:00
Disk usage = 90%

11:10
Monitoring alert triggered

11:15
Engineer investigates using df/du/lsof

11:20
Root cause identified

11:25
Old logs rotated/removed safely

11:30
Disk usage = 65%

11:35
NGINX health verified

11:45
Root cause fixed

12:00
Additional monitoring and log retention controls deployed

This demonstrates that the incident response includes both recovery and prevention.

---

30. Final Troubleshooting Summary

The most important commands I would use are:

# Filesystem usage
df -h
df -hT

# Inode usage
df -ih

# Find large directories
sudo du -xhd1 / 2>/dev/null | sort -h

# Find large files
sudo find /var -xdev -type f -printf '%s %p\n' 2>/dev/null \
  | sort -n | tail -20

# NGINX logs
sudo ls -lh /var/log/nginx/
sudo tail -100 /var/log/nginx/error.log

# NGINX configuration
sudo nginx -T

# Log rotation
ls -l /etc/logrotate.d/nginx
sudo logrotate -d /etc/logrotate.d/nginx

# systemd journal
sudo journalctl --disk-usage
sudo journalctl -p err -b

# Deleted but still-open files
sudo lsof +L1

# NGINX health
sudo nginx -t
sudo systemctl status nginx

The investigation should always start with:

df -h
df -ih

and then progressively narrow the investigation using:

Filesystem
    ↓
Directory
    ↓
File
    ↓
Process
    ↓
Root cause

---

31. Conclusion

For a 64 GB Ubuntu VM running only NGINX, the most likely causes of 99% disk utilization are unbounded NGINX logs, failed log rotation, system journal growth, deleted-but-open log files, temporary files, or excessive small-file creation.

The troubleshooting process should distinguish between block exhaustion and inode exhaustion, identify exactly which files are consuming capacity, and determine which process owns those files before performing cleanup.

The recovery must prioritize maintaining the load balancer's availability. Once the immediate disk pressure is resolved, the underlying cause should be fixed through log rotation, retention policies, monitoring, alerting, and appropriate operational controls.

The objective is not simply to free disk space, but to restore the production service safely and prevent the same incident from recurring.