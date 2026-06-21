# WebCash Deployment Guide

## 1. Deploy Supabase Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref whglmhqnestemuhvtpsm

# Deploy functions (one by one)
supabase functions deploy ashtech-countries --no-verify-jwt
supabase functions deploy ashtech-fees --no-verify-jwt
supabase functions deploy ashtech-collect
supabase functions deploy ashtech-status
supabase functions deploy ashtech-webhook --no-verify-jwt
supabase functions deploy upload-file
supabase functions deploy delete-file
supabase functions deploy list-files
```

## 2. Set Environment Variables in Supabase

Go to: Dashboard > Edge Functions > Settings

Add these secrets:
```
ASHTECH_API_KEY=your_ashtechpay_api_key
```

## 3. Create Storage Buckets

In Supabase Dashboard > Storage, create these buckets:
- `course-files` (public)
- `product-files` (public)
- `avatar-images` (public)
- `tutorial-files` (public)
- `podcast-audio` (public)
- `ticket-attachments` (private)
- `general-uploads` (public)

## 4. Run SQL Schema

Execute `supabase/complete-schema.sql` in Supabase SQL Editor.

## 5. Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## 6. Set Vercel Environment Variables

```
VITE_SUPABASE_URL=https://whglmhqnestemuhvtpsm.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Function Summary

| Function | Purpose | Auth |
|----------|---------|------|
| `ashtech-countries` | GET /v1/countries | Public |
| `ashtech-fees` | GET /v1/fees | Public |
| `ashtech-collect` | POST /v1/collect | User JWT |
| `ashtech-status` | GET /v1/transaction/:id | User JWT |
| `ashtech-webhook` | Payment callbacks | No auth |
| `upload-file` | File uploads | User JWT |
| `delete-file` | Delete files | User JWT |
| `list-files` | List files | User JWT |

## Testing Payments

1. Create a test user account
2. Navigate to /payment
3. Select country and operator
4. Enter test phone number
5. Complete payment simulation

## Features Implemented

- Mobile Money payments (MTN, Orange, M-Pesa, etc.)
- OTP payment flow
- Automatic subscription activation
- File uploads (courses, products, tutorials, podcasts)
- Wallet system with referral bonuses
- Live sales feed
- Push notifications
- PWA installable
