

# Fix: Cloudinary Invalid Signature

## Root Cause

The Cloudinary "Invalid Signature" error means the `CLOUDINARY_API_SECRET` stored in your backend secrets does not match the `CLOUDINARY_API_KEY` that's also stored.

From your Cloudinary dashboard screenshot, you have two API key pairs:
- **SafeDeal**: API Key `439152443579166`
- **Root**: API Key `715591611478739`

The edge function is returning API key `439152443579166` (SafeDeal), but the stored `CLOUDINARY_API_SECRET` likely belongs to the other (Root) key. The signature is generated with a mismatched secret, so Cloudinary rejects it.

## Fix

No code changes needed. You need to update your backend secret so the API key and API secret are from the **same** Cloudinary key pair.

1. Go to your Cloudinary dashboard > API Keys
2. Copy the **API Secret** for the **SafeDeal** key (the one with API Key `439152443579166`)
3. Update the `CLOUDINARY_API_SECRET` backend secret with that value

Alternatively, if you want to use the Root key pair instead, update both `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to match the Root key pair.

## Files Changed
None -- this is a secrets configuration issue only.

