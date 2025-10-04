# GitHub Environment Setup for Production Approval

This guide shows how to configure GitHub environments for production deployment approval.

## Why Environment Protection?

Production deployments require manual approval to:
- ✅ Prevent accidental deployments
- ✅ Ensure code review
- ✅ Add audit trail
- ✅ Allow final verification before deployment

## Setup Steps

### 1. Create Production Environment

1. Go to your GitHub repository
2. Click **Settings** → **Environments**
3. Click **New environment**
4. Name: `production-approval`
5. Click **Configure environment**

### 2. Add Protection Rules

#### Required Reviewers

1. Under **Deployment protection rules**
2. Check ☑️ **Required reviewers**
3. Click **Add reviewers**
4. Add team members who can approve:
   - Minimum: 1 reviewer
   - Recommended: 2+ reviewers
5. Click **Save protection rules**

#### Wait Timer (Optional)

1. Check ☑️ **Wait timer**
2. Set delay (e.g., 5 minutes)
3. This gives time to cancel accidental deployments

#### Deployment Branches (Optional)

1. Under **Deployment branches**
2. Select **Selected branches**
3. Add pattern: `prod`
4. This ensures only `prod` branch can deploy to production

### 3. Test the Setup

1. Go to **Actions** → **Deploy to Production**
2. Click **Run workflow**
3. Select branch: `prod`
4. Click **Run workflow**

The workflow will:
- Run pre-deployment checks
- Pause at "Manual Approval Required" step
- Send notifications to reviewers
- Wait for approval

### 4. Approve a Deployment

#### As a Reviewer:

1. You'll receive a notification (email/GitHub)
2. Go to the **Actions** tab
3. Click on the running workflow
4. Find the **Manual Approval Required** job
5. Click **Review deployments**
6. Review the details:
   - Commit SHA
   - Changes included
   - Actor who triggered it
7. Click **Approve and deploy** or **Reject**
8. Optionally add a comment

### 5. Alternative: Environment Secrets

If you need environment-specific secrets:

1. In environment settings
2. Scroll to **Environment secrets**
3. Click **Add secret**
4. Add secrets only accessible in this environment

Example:
```
PROD_DATABASE_URL = <production-db-url>
PROD_API_KEY = <production-api-key>
```

## Configuration Summary

```yaml
Environment: production-approval

Protection Rules:
  ✅ Required reviewers: 2
  ✅ Wait timer: 5 minutes
  ✅ Deployment branches: prod only

Reviewers:
  - tech-lead@example.com
  - devops@example.com
```

## Workflow Integration

Your `deploy-prod.yml` workflow references this environment:

```yaml
manual-approval:
  name: Manual Approval Required
  environment:
    name: production-approval  # This triggers the approval
  steps:
    - name: Wait for approval
      run: echo "Waiting for approval..."
```

## Notifications

Reviewers receive notifications via:
- 📧 Email
- 🔔 GitHub notifications
- 📱 GitHub mobile app

Enable in your GitHub settings:
1. Settings → Notifications
2. Check ☑️ **Actions**
3. Check ☑️ **Email** or **Web**

## Audit Trail

All approvals are logged:
- Who approved
- When approved
- Comments
- Deployment outcome

View in:
- Actions → Workflow run → Environment section
- Settings → Environments → production-approval → Deployments

## Emergency Skip (Use Carefully)

In emergencies, you can skip approval:

```yaml
# When running workflow
skip_approval: true  # Set this to true
```

⚠️ **Warning:** This should only be used for critical hotfixes.

## Best Practices

1. **Multiple Reviewers**: Require at least 2 approvers
2. **Different Teams**: Include both dev and ops in reviewers
3. **Wait Timer**: Add 5-10 minute delay for critical thinking
4. **Branch Protection**: Only allow prod branch to deploy
5. **Audit**: Regularly review deployment history
6. **Documentation**: Document why each deployment was approved

## Troubleshooting

### Issue: No notification received

**Solution:**
1. Check GitHub notification settings
2. Verify you're added as a reviewer
3. Check spam folder for emails

### Issue: Can't approve deployment

**Solution:**
1. Verify you're in the reviewers list
2. Check you have repository permissions
3. Try refreshing the page

### Issue: Approval not progressing workflow

**Solution:**
1. Check if all required approvers have approved
2. Verify wait timer has elapsed
3. Check for workflow errors in previous steps

## Testing Approval Flow

Run a test deployment:

```bash
# 1. Make a small change
git checkout prod
echo "# Test deployment" >> README.md
git commit -am "test: deployment approval flow"
git push origin prod

# 2. Trigger workflow (GitHub UI)
# 3. Wait for approval step
# 4. Approve as reviewer
# 5. Verify deployment completes
```

## Reference

- [GitHub Environments Docs](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Deployment Protection Rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules)
