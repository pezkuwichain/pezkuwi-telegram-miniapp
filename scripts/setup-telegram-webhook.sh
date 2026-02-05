#!/bin/bash

# PezkuwiChain Telegram Bot Webhook Setup
# Run this script from a machine that can access Telegram API

BOT_TOKEN="8548408481:AAEsoyiVBllk_x0T3Jelj8N8VrUiuc9jXQw"
WEBHOOK_URL="https://vbhftvdayqfmcgmzdxfv.supabase.co/functions/v1/telegram-bot"

echo "Setting up Telegram webhook..."
echo "Bot Token: ${BOT_TOKEN:0:10}..."
echo "Webhook URL: $WEBHOOK_URL"
echo ""

# Delete any existing webhook
echo "Removing existing webhook..."
curl -s "https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook" | jq .

# Set new webhook
echo ""
echo "Setting new webhook..."
curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WEBHOOK_URL" \
  -d "allowed_updates=[\"message\",\"callback_query\"]" | jq .

# Verify webhook
echo ""
echo "Verifying webhook..."
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo" | jq .

echo ""
echo "Done! Test the bot by sending /start to @pezkuwichain_bot"
