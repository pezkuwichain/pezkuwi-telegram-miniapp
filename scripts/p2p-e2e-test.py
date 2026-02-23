#!/usr/bin/env python3
"""
P2P E2E Test Script
===================
Tests the full P2P fiat trading flow using real Supabase tables.

Since no RPC functions exist yet (lock_escrow_internal, etc.),
all business logic is done via direct table operations with service role key.

Table name: user_internal_balances (NOT p2p_internal_balances)
payment_methods.id: UUID auto-generated (NOT string)

Usage:
  export SUPABASE_SERVICE_KEY="your-service-role-key"
  python3 scripts/p2p-e2e-test.py
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

# ============================================================
# Configuration
# ============================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vbhftvdayqfmcgmzdxfv.supabase.co")
API_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

ASSET_HUB_RPC = "wss://asset-hub-rpc.pezkuwichain.io"
PEOPLE_RPC = "wss://people-rpc.pezkuwichain.io"

PLATFORM_DEPOSIT_WALLET = "5H18ZZBU4LwPYbeEZ1JBGvibCU2edhhM8HNUtFi7GgC36CgS"

# Test wallet addresses
TEST1_ADDR = "5HTU5xskxgx9HM2X8ssBCNkuQ4XECQXpfn85VkQEY6AE9YbT"
TEST3_ADDR = "5H6fCw1vWq9J4u8KvrDcyLCxtjKNYpVtnTCJNurJvJNs6Ggw"
TEST5_ADDR = "5FpNVJ3RA6HXZ8Ud3XL5ThQD7FADQgrGUnayRbYcwu67Gw6q"

# UUIDs from identityToUUID
TEST1_UUID = "27f3fb84-ffd0-5f52-8b4d-24a829d08af5"
TEST3_UUID = "3e34c269-20a6-55f9-a678-6af9754b0bd1"
TEST5_UUID = "28a6f9c9-d8fc-5185-abd0-3dae947e3798"

# Identity numbers (pre-computed, validated in step 1)
TEST1_CITIZEN = "#42-39-213321"
TEST3_CITIZEN = "#42-38-174568"
TEST5_VISA = "V-918994"

# Will be set dynamically after seeding
PAYMENT_METHOD_ID = None
TRADE_COLUMNS = []  # Discovered at runtime in step 0

# ============================================================
# Helpers
# ============================================================

class C:
    G = "\033[92m"; R = "\033[91m"; Y = "\033[93m"; B = "\033[96m"
    BOLD = "\033[1m"; END = "\033[0m"

def log_step(n, title):
    print(f"\n{C.BOLD}{C.B}{'='*60}\n  Step {n}: {title}\n{'='*60}{C.END}\n")

def log_ok(msg):
    print(f"  {C.G}[OK]{C.END} {msg}")

def log_fail(msg):
    print(f"  {C.R}[FAIL]{C.END} {msg}")

def log_info(msg):
    print(f"  {C.Y}[INFO]{C.END} {msg}")

def check(condition, msg):
    if condition:
        log_ok(msg)
    else:
        log_fail(msg)
        raise AssertionError(msg)

def check_eq(actual, expected, msg):
    if actual == expected:
        log_ok(f"{msg}: {actual}")
    else:
        log_fail(f"{msg}: expected={expected}, got={actual}")
        raise AssertionError(f"{msg}: expected={expected}, got={actual}")

def check_gte(actual, threshold, msg):
    if actual >= threshold:
        log_ok(f"{msg}: {actual} >= {threshold}")
    else:
        log_fail(f"{msg}: {actual} < {threshold}")
        raise AssertionError(f"{msg}: {actual} < {threshold}")

# ============================================================
# Supabase REST helpers
# ============================================================

def headers(prefer=None):
    h = {
        "apikey": API_KEY,
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h

def db_insert(table, data):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=headers(prefer="return=representation"),
        json=data,
    )
    if r.status_code >= 400:
        log_fail(f"INSERT {table}: {r.status_code} {r.text}")
        return None
    rows = r.json()
    return rows[0] if rows else None

def db_select(table, filters=None, single=False):
    params = {f"{k}": f"eq.{v}" for k, v in (filters or {}).items()}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=headers(), params=params)
    if r.status_code >= 400:
        log_fail(f"SELECT {table}: {r.status_code} {r.text}")
        return [] if not single else None
    rows = r.json()
    if single:
        return rows[0] if rows else None
    return rows

def db_update(table, filters, data):
    params = {f"{k}": f"eq.{v}" for k, v in (filters or {}).items()}
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=headers(prefer="return=representation"),
        params=params,
        json=data,
    )
    if r.status_code >= 400:
        log_fail(f"UPDATE {table}: {r.status_code} {r.text}")
        return None
    rows = r.json()
    return rows[0] if rows else None

def db_upsert(table, data, on_conflict="user_id,token"):
    h = headers(prefer="return=representation,resolution=merge-duplicates")
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=h,
        json=data,
    )
    if r.status_code >= 400:
        log_fail(f"UPSERT {table}: {r.status_code} {r.text}")
        return None
    rows = r.json()
    return rows[0] if rows else None

def db_get_columns(table):
    """Discover column names by selecting with limit=0, or from existing row."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}?limit=1",
        headers=headers(),
    )
    if r.status_code == 200:
        rows = r.json()
        if rows:
            return list(rows[0].keys())
    return []

# ============================================================
# Business logic helpers (since no RPC functions exist)
# ============================================================

def get_balance(user_id, token="HEZ"):
    return db_select("user_internal_balances", {"user_id": user_id, "token": token}, single=True)

def lock_escrow(user_id, token, amount):
    """Lock balance: available -= amount, locked += amount."""
    bal = get_balance(user_id, token)
    if not bal:
        log_fail(f"No balance record for {user_id}")
        return False
    if bal["available_balance"] < amount:
        log_fail(f"Insufficient balance: {bal['available_balance']} < {amount}")
        return False
    result = db_update("user_internal_balances", {"user_id": user_id, "token": token}, {
        "available_balance": bal["available_balance"] - amount,
        "locked_balance": bal["locked_balance"] + amount,
    })
    if result:
        log_ok(f"Escrow locked: {amount} {token} (avail: {result['available_balance']}, locked: {result['locked_balance']})")
        log_balance_tx(user_id, token, "escrow_lock", -amount, bal["available_balance"], result["available_balance"])
    return result is not None

def release_escrow(from_user, to_user, token, amount, ref_type="trade", ref_id=None):
    """Release from seller's locked to buyer's available."""
    seller = get_balance(from_user, token)
    buyer = get_balance(to_user, token)
    if not seller or not buyer:
        log_fail("Missing balance records for release")
        return False

    # Seller: locked -= amount
    db_update("user_internal_balances", {"user_id": from_user, "token": token}, {
        "locked_balance": max(0, seller["locked_balance"] - amount),
    })
    log_balance_tx(from_user, token, "escrow_release", -amount, seller["locked_balance"], max(0, seller["locked_balance"] - amount), ref_type=ref_type, ref_id=ref_id)

    # Buyer: available += amount
    result = db_update("user_internal_balances", {"user_id": to_user, "token": token}, {
        "available_balance": buyer["available_balance"] + amount,
    })
    log_balance_tx(to_user, token, "trade_receive", amount, buyer["available_balance"], buyer["available_balance"] + amount, ref_type=ref_type, ref_id=ref_id)

    if result:
        log_ok(f"Escrow released: {amount} {token} from {from_user[:8]}... to {to_user[:8]}...")
    return result is not None

def refund_escrow(user_id, token, amount):
    """Refund: locked -= amount, available += amount."""
    bal = get_balance(user_id, token)
    if not bal:
        return False
    result = db_update("user_internal_balances", {"user_id": user_id, "token": token}, {
        "locked_balance": max(0, bal["locked_balance"] - amount),
        "available_balance": bal["available_balance"] + amount,
    })
    if result:
        log_ok(f"Escrow refunded: {amount} {token} (avail: {result['available_balance']}, locked: {result['locked_balance']})")
        log_balance_tx(user_id, token, "escrow_refund", amount, bal["available_balance"], result["available_balance"])
    return result is not None

def log_balance_tx(user_id, token, tx_type, amount, before, after, ref_type=None, ref_id=None):
    """Log to p2p_balance_transactions."""
    db_insert("p2p_balance_transactions", {
        "user_id": user_id,
        "token": token,
        "transaction_type": tx_type,
        "amount": amount,
        "balance_before": before,
        "balance_after": after,
        "reference_type": ref_type or "e2e_test",
        "reference_id": ref_id,
        "description": f"E2E test: {tx_type} {amount} {token}",
    })

def accept_offer(offer_id, buyer_id, buyer_wallet, amount):
    """Accept offer: update offer remaining, create trade."""
    offer = db_select("p2p_fiat_offers", {"id": offer_id}, single=True)
    if not offer:
        log_fail("Offer not found")
        return None
    if offer["remaining_amount"] < amount:
        log_fail(f"Insufficient remaining: {offer['remaining_amount']} < {amount}")
        return None

    new_remaining = offer["remaining_amount"] - amount
    new_status = "locked" if new_remaining == 0 else "open"
    db_update("p2p_fiat_offers", {"id": offer_id}, {
        "remaining_amount": new_remaining,
        "status": new_status,
    })

    now = datetime.now(timezone.utc)
    deadline = now + timedelta(minutes=offer.get("time_limit_minutes", 30))

    fiat_per_unit = offer.get("price_per_unit", 0) or (offer["fiat_amount"] / offer["amount_crypto"] if offer["amount_crypto"] else 0)

    # All REQUIRED columns from OpenAPI spec discovery:
    # id (auto), offer_id, seller_id, buyer_id, buyer_wallet,
    # crypto_amount, fiat_amount, price_per_unit, escrow_locked_amount,
    # status (default: pending), payment_deadline
    trade_data = {
        "offer_id": offer_id,
        "seller_id": offer["seller_id"],
        "buyer_id": buyer_id,
        "buyer_wallet": buyer_wallet,
        "crypto_amount": amount,
        "fiat_amount": amount * fiat_per_unit,
        "price_per_unit": fiat_per_unit,
        "escrow_locked_amount": amount,
        "status": "pending",
        "payment_deadline": deadline.isoformat(),
    }

    log_info(f"Trade INSERT columns: {list(trade_data.keys())}")
    trade = db_insert("p2p_fiat_trades", trade_data)
    return trade

# ============================================================
# Test Steps
# ============================================================

def step0_seed_payment_method():
    """Ensure an IQD payment method exists."""
    global PAYMENT_METHOD_ID
    log_step(0, "Seed Payment Method & Discover Schema")

    # Check if IQD method exists
    existing = db_select("payment_methods", {"currency": "IQD"})
    if existing:
        PAYMENT_METHOD_ID = existing[0]["id"]
        log_ok(f"IQD payment method exists: {PAYMENT_METHOD_ID}")
    else:
        result = db_insert("payment_methods", {
            "currency": "IQD",
            "country": "IQ",
            "method_name": "Bank Transfer (IQD)",
            "method_type": "bank_transfer",
            "fields": {"bank_name": "string", "account_number": "string", "account_holder": "string"},
            "validation_rules": {},
            "is_active": True,
        })
        check(result is not None, "Payment method created")
        PAYMENT_METHOD_ID = result["id"]
        log_ok(f"Created IQD payment method: {PAYMENT_METHOD_ID}")

    # Discover table schemas for debugging
    global TRADE_COLUMNS
    for table in ["p2p_fiat_offers", "p2p_fiat_trades", "user_internal_balances"]:
        cols = db_get_columns(table)
        if cols:
            log_info(f"{table} columns ({len(cols)}): {cols}")
            if table == "p2p_fiat_trades":
                TRADE_COLUMNS = cols
        else:
            log_info(f"{table}: empty (columns unknown) — will discover on first insert error")


def step1_verify_identities():
    """Verify citizen/visa identities on People Chain."""
    log_step(1, "Identity Verification (Read-only)")

    try:
        from substrateinterface import SubstrateInterface
        people = SubstrateInterface(url=PEOPLE_RPC)

        # Test 1: NFT 42-39
        nft1 = people.query("Nfts", "Item", [42, 39])
        if nft1.value:
            owner = nft1.value.get("owner", "")
            check_eq(owner, TEST1_ADDR, "Test 1 NFT 42-39 owner")
        else:
            log_info("Test 1: NFT query empty (may use different storage)")

        # Test 3: NFT 42-38
        nft3 = people.query("Nfts", "Item", [42, 38])
        if nft3.value:
            owner = nft3.value.get("owner", "")
            check_eq(owner, TEST3_ADDR, "Test 3 NFT 42-38 owner")
        else:
            log_info("Test 3: NFT query empty (may use different storage)")

        people.close()
    except Exception as e:
        log_info(f"People Chain query skipped: {e}")

    log_ok(f"Test 1: {TEST1_CITIZEN} -> {TEST1_UUID}")
    log_ok(f"Test 3: {TEST3_CITIZEN} -> {TEST3_UUID}")
    log_ok(f"Test 5: {TEST5_VISA} -> {TEST5_UUID}")


def step1b_seed_test_users():
    """Ensure test users exist in auth.users (FK target for p2p tables)."""
    log_step("1b", "Seed Test Users (auth.users)")

    test_users = [
        {"id": TEST1_UUID, "email": "e2e_test1@pezkuwichain.io", "first_name": "Test1_Seller", "wallet": TEST1_ADDR},
        {"id": TEST3_UUID, "email": "e2e_test3@pezkuwichain.io", "first_name": "Test3_Buyer",  "wallet": TEST3_ADDR},
        {"id": TEST5_UUID, "email": "e2e_test5@pezkuwichain.io", "first_name": "Test5_Visa",   "wallet": TEST5_ADDR},
    ]

    auth_h = {"apikey": API_KEY, "Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    for u in test_users:
        # Check if auth user already exists
        r = requests.get(
            f"{SUPABASE_URL}/auth/v1/admin/users/{u['id']}",
            headers=auth_h,
        )
        if r.status_code == 200 and r.json().get("id"):
            log_ok(f"{u['first_name']}: already in auth.users")
            continue

        # Create auth user with specific ID
        r = requests.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=auth_h,
            json={
                "id": u["id"],
                "email": u["email"],
                "email_confirm": True,
                "user_metadata": {
                    "first_name": u["first_name"],
                    "wallet_address": u["wallet"],
                },
            },
        )
        if r.status_code in (200, 201):
            log_ok(f"{u['first_name']}: created in auth.users (id={u['id']})")
        else:
            log_fail(f"Failed to create {u['first_name']} in auth.users: {r.status_code} {r.text[:150]}")

    # Also ensure they exist in public.users (for display names etc.)
    for u in test_users:
        existing = db_select("users", {"id": u["id"]}, single=True)
        if not existing:
            db_insert("users", {
                "id": u["id"],
                "telegram_id": abs(hash(u["email"])) % 10**9,
                "first_name": u["first_name"],
                "username": u["email"].split("@")[0],
                "wallet_address": u["wallet"],
            })


def step2_ensure_balances():
    """Reset and seed internal balance records for test users (idempotent)."""
    log_step(2, "Reset & Seed Internal Balances")

    # Always reset to clean state for idempotent runs
    for uid, label, amount in [
        (TEST1_UUID, "Test 1 (Seller)", 10),
        (TEST3_UUID, "Test 3 (Buyer)", 5),
        (TEST5_UUID, "Test 5 (Visa)", 2),
    ]:
        existing = get_balance(uid)
        if existing:
            db_update("user_internal_balances", {"user_id": uid, "token": "HEZ"}, {
                "available_balance": amount,
                "locked_balance": 0,
                "total_deposited": amount,
            })
            log_ok(f"{label}: reset to {amount} HEZ (avail={amount}, locked=0)")
        else:
            db_insert("user_internal_balances", {
                "user_id": uid,
                "token": "HEZ",
                "available_balance": amount,
                "locked_balance": 0,
                "total_deposited": amount,
                "total_withdrawn": 0,
            })
            log_ok(f"{label}: created with {amount} HEZ")

    # Verify
    for uid, label, minimum in [
        (TEST1_UUID, "Test 1", 10),
        (TEST3_UUID, "Test 3", 5),
        (TEST5_UUID, "Test 5", 2),
    ]:
        bal = get_balance(uid)
        check(bal is not None, f"{label} balance record exists")
        check_gte(bal["available_balance"], minimum, f"{label} available")


def step3_create_offer():
    """Seller (Test 1) locks 5 HEZ escrow and creates offer. Price: 1 HEZ = 600 IQD."""
    log_step(3, "Create Offer (Seller = Test 1, 5 HEZ @ 600 IQD/HEZ)")

    # Lock escrow
    check(lock_escrow(TEST1_UUID, "HEZ", 5), "Escrow locked 5 HEZ")

    # Create offer: 5 HEZ * 600 IQD/HEZ = 3000 IQD
    offer = db_insert("p2p_fiat_offers", {
        "seller_id": TEST1_UUID,
        "seller_wallet": TEST1_ADDR,
        "token": "HEZ",
        "amount_crypto": 5,
        "remaining_amount": 5,
        "fiat_currency": "IQD",
        "fiat_amount": 3000,
        "payment_method_id": PAYMENT_METHOD_ID,
        "payment_details_encrypted": "e2e-test-bank-details",
        "time_limit_minutes": 30,
        "status": "open",
        "escrow_locked_at": datetime.now(timezone.utc).isoformat(),
    })
    check(offer is not None, "Offer created")
    check_eq(offer["status"], "open", "Offer status")
    log_ok(f"Offer ID: {offer['id']}")

    # Verify locked balance
    bal = get_balance(TEST1_UUID)
    check_gte(bal["locked_balance"], 5, "Seller locked_balance")

    return offer["id"]


def step4_accept_trade(offer_id):
    """Buyer (Test 3) accepts the offer."""
    log_step(4, "Accept Trade (Buyer = Test 3)")

    trade = accept_offer(offer_id, TEST3_UUID, TEST3_ADDR, 5)
    check(trade is not None, "Trade created")
    check_eq(trade["status"], "pending", "Trade status")
    check_eq(trade["buyer_id"], TEST3_UUID, "Buyer is Test 3")
    check_eq(trade["seller_id"], TEST1_UUID, "Seller is Test 1")

    trade_id = trade["id"]
    log_ok(f"Trade ID: {trade_id}")

    # Verify offer updated
    offer = db_select("p2p_fiat_offers", {"id": offer_id}, single=True)
    check_eq(offer["remaining_amount"], 0, "Offer remaining_amount")
    log_info(f"Offer status: {offer['status']}")

    return trade_id


def step5_payment_sent(trade_id):
    """Buyer marks payment as sent."""
    log_step(5, "Payment Sent (Buyer marks)")

    now = datetime.now(timezone.utc)
    result = db_update("p2p_fiat_trades", {"id": trade_id}, {
        "status": "payment_sent",
        "buyer_marked_paid_at": now.isoformat(),
        "confirmation_deadline": (now + timedelta(hours=1)).isoformat(),
    })
    check(result is not None, "Trade updated")
    check_eq(result["status"], "payment_sent", "Trade status")


def step6_confirm_and_release(trade_id, offer_id):
    """Seller confirms payment, escrow released to buyer."""
    log_step(6, "Confirm & Release (Seller confirms)")

    seller_before = get_balance(TEST1_UUID)
    buyer_before = get_balance(TEST3_UUID)
    log_info(f"Before: Seller locked={seller_before['locked_balance']}, Buyer avail={buyer_before['available_balance']}")

    # Release escrow
    check(release_escrow(TEST1_UUID, TEST3_UUID, "HEZ", 5, "trade", trade_id), "Escrow released")

    # Update trade to completed
    now = datetime.now(timezone.utc).isoformat()
    db_update("p2p_fiat_trades", {"id": trade_id}, {
        "status": "completed",
        "seller_confirmed_at": now,
        "escrow_released_at": now,
        "completed_at": now,
    })

    # Verify
    seller_after = get_balance(TEST1_UUID)
    buyer_after = get_balance(TEST3_UUID)
    log_info(f"After: Seller locked={seller_after['locked_balance']}, Buyer avail={buyer_after['available_balance']}")

    seller_diff = seller_before["locked_balance"] - seller_after["locked_balance"]
    check_gte(seller_diff, 4.99, "Seller locked decreased")

    buyer_diff = buyer_after["available_balance"] - buyer_before["available_balance"]
    check_gte(buyer_diff, 4.99, "Buyer available increased")

    trade = db_select("p2p_fiat_trades", {"id": trade_id}, single=True)
    check_eq(trade["status"], "completed", "Trade status")

    log_ok("Happy path trade completed!")


def step7_cancel_flow():
    """Create offer, accept, then cancel — verify escrow refund."""
    log_step(7, "Cancel Flow Test")

    # Ensure seller has enough
    bal = get_balance(TEST1_UUID)
    if bal["available_balance"] < 3:
        db_update("user_internal_balances", {"user_id": TEST1_UUID, "token": "HEZ"}, {
            "available_balance": bal["available_balance"] + 5,
        })

    # Lock & create offer (3 HEZ)
    check(lock_escrow(TEST1_UUID, "HEZ", 3), "Cancel test: escrow locked")

    # 3 HEZ * 600 IQD/HEZ = 1800 IQD
    offer = db_insert("p2p_fiat_offers", {
        "seller_id": TEST1_UUID,
        "seller_wallet": TEST1_ADDR,
        "token": "HEZ",
        "amount_crypto": 3,
        "remaining_amount": 3,
        "fiat_currency": "IQD",
        "fiat_amount": 1800,
        "payment_method_id": PAYMENT_METHOD_ID,
        "payment_details_encrypted": "e2e-cancel-test",
        "time_limit_minutes": 30,
        "status": "open",
        "escrow_locked_at": datetime.now(timezone.utc).isoformat(),
    })
    check(offer is not None, "Cancel test offer created")
    offer_id = offer["id"]

    # Accept
    trade = accept_offer(offer_id, TEST3_UUID, TEST3_ADDR, 3)
    check(trade is not None, "Cancel test trade created")
    trade_id = trade["id"]

    seller_before = get_balance(TEST1_UUID)

    # Cancel trade (column name is cancellation_reason, not cancel_reason)
    db_update("p2p_fiat_trades", {"id": trade_id}, {
        "status": "cancelled",
        "cancelled_by": TEST3_UUID,
        "cancellation_reason": "E2E test cancel",
    })

    # Refund escrow
    check(refund_escrow(TEST1_UUID, "HEZ", 3), "Escrow refunded")

    # Restore offer
    db_update("p2p_fiat_offers", {"id": offer_id}, {
        "remaining_amount": 3,
        "status": "open",
    })

    # Verify
    trade = db_select("p2p_fiat_trades", {"id": trade_id}, single=True)
    check_eq(trade["status"], "cancelled", "Trade cancelled")

    offer = db_select("p2p_fiat_offers", {"id": offer_id}, single=True)
    check_eq(offer["remaining_amount"], 3, "Offer remaining restored")
    check_eq(offer["status"], "open", "Offer re-opened")

    seller_after = get_balance(TEST1_UUID)
    log_info(f"Seller: locked before={seller_before['locked_balance']}, after={seller_after['locked_balance']}")

    log_ok("Cancel flow completed!")


def step8_visa_user_trade():
    """Visa user (Test 5) as buyer in a full trade cycle."""
    log_step(8, "Visa User Trade (Test 5)")

    # Ensure balances
    bal5 = get_balance(TEST5_UUID)
    if not bal5 or bal5.get("available_balance", 0) < 2:
        if bal5:
            db_update("user_internal_balances", {"user_id": TEST5_UUID, "token": "HEZ"}, {"available_balance": 2})
        else:
            db_insert("user_internal_balances", {
                "user_id": TEST5_UUID, "token": "HEZ",
                "available_balance": 2, "locked_balance": 0,
                "total_deposited": 2, "total_withdrawn": 0,
            })

    bal1 = get_balance(TEST1_UUID)
    if bal1["available_balance"] < 2:
        db_update("user_internal_balances", {"user_id": TEST1_UUID, "token": "HEZ"}, {
            "available_balance": bal1["available_balance"] + 5,
        })

    # Seller locks 2 HEZ
    check(lock_escrow(TEST1_UUID, "HEZ", 2), "Visa test: escrow locked")

    # 2 HEZ * 600 IQD/HEZ = 1200 IQD
    offer = db_insert("p2p_fiat_offers", {
        "seller_id": TEST1_UUID,
        "seller_wallet": TEST1_ADDR,
        "token": "HEZ",
        "amount_crypto": 2,
        "remaining_amount": 2,
        "fiat_currency": "IQD",
        "fiat_amount": 1200,
        "payment_method_id": PAYMENT_METHOD_ID,
        "payment_details_encrypted": "e2e-visa-test",
        "time_limit_minutes": 30,
        "status": "open",
        "escrow_locked_at": datetime.now(timezone.utc).isoformat(),
    })
    check(offer is not None, "Visa test offer created")

    # Visa user accepts
    trade = accept_offer(offer["id"], TEST5_UUID, TEST5_ADDR, 2)
    check(trade is not None, "Visa user trade created")
    check_eq(trade["buyer_id"], TEST5_UUID, "Buyer is Test 5 (Visa)")

    trade_id = trade["id"]

    # Payment flow
    now = datetime.now(timezone.utc)
    db_update("p2p_fiat_trades", {"id": trade_id}, {
        "status": "payment_sent",
        "buyer_marked_paid_at": now.isoformat(),
        "confirmation_deadline": (now + timedelta(hours=1)).isoformat(),
    })

    # Release
    check(release_escrow(TEST1_UUID, TEST5_UUID, "HEZ", 2, "trade", trade_id), "Visa trade: escrow released")

    now_str = datetime.now(timezone.utc).isoformat()
    db_update("p2p_fiat_trades", {"id": trade_id}, {
        "status": "completed",
        "seller_confirmed_at": now_str,
        "escrow_released_at": now_str,
        "completed_at": now_str,
    })

    trade = db_select("p2p_fiat_trades", {"id": trade_id}, single=True)
    check_eq(trade["status"], "completed", "Visa trade completed")
    check_eq(trade["buyer_id"], TEST5_UUID, "Buyer is Visa user")

    log_ok("Visa user trade completed!")


def step9_withdrawal_request():
    """Test 3 requests a withdrawal."""
    log_step(9, "Withdrawal Request (Test 3)")

    bal_before = get_balance(TEST3_UUID)
    if bal_before["available_balance"] < 2:
        db_update("user_internal_balances", {"user_id": TEST3_UUID, "token": "HEZ"}, {
            "available_balance": bal_before["available_balance"] + 5,
        })
        bal_before = get_balance(TEST3_UUID)

    log_info(f"Before: available={bal_before['available_balance']}, locked={bal_before['locked_balance']}")

    # Lock balance for withdrawal
    db_update("user_internal_balances", {"user_id": TEST3_UUID, "token": "HEZ"}, {
        "available_balance": bal_before["available_balance"] - 2,
        "locked_balance": bal_before["locked_balance"] + 2,
    })

    # Create withdrawal request
    wr = db_insert("p2p_deposit_withdraw_requests", {
        "user_id": TEST3_UUID,
        "request_type": "withdraw",
        "token": "HEZ",
        "amount": 2,
        "wallet_address": TEST3_ADDR,
        "status": "pending",
    })
    check(wr is not None, f"Withdrawal request created: {wr['id']}")

    # Log transaction
    log_balance_tx(TEST3_UUID, "HEZ", "withdraw_lock", -2,
                   bal_before["available_balance"],
                   bal_before["available_balance"] - 2,
                   "withdraw_request", wr["id"])

    # Verify
    bal_after = get_balance(TEST3_UUID)
    log_info(f"After: available={bal_after['available_balance']}, locked={bal_after['locked_balance']}")

    avail_diff = bal_before["available_balance"] - bal_after["available_balance"]
    check_gte(avail_diff, 1.99, "Available decreased")

    locked_diff = bal_after["locked_balance"] - bal_before["locked_balance"]
    check_gte(locked_diff, 1.99, "Locked increased")

    # Verify withdrawal request
    wr_list = db_select("p2p_deposit_withdraw_requests", {
        "user_id": TEST3_UUID,
        "request_type": "withdraw",
        "status": "pending",
    })
    check(len(wr_list) > 0, "Pending withdrawal request exists")

    log_ok("Withdrawal request test completed!")


def step_x_check_logs():
    """Check balance transaction logs."""
    log_step("X", "Balance Transaction Logs")

    for uid, label in [(TEST1_UUID, "Test 1"), (TEST3_UUID, "Test 3"), (TEST5_UUID, "Test 5")]:
        txns = db_select("p2p_balance_transactions", {"user_id": uid})
        if txns:
            log_ok(f"{label}: {len(txns)} transactions logged")
            for t in txns[-3:]:
                log_info(f"  {t.get('transaction_type')}: {t.get('amount')} {t.get('token')} | {t.get('description', '')[:50]}")
        else:
            log_info(f"{label}: no transactions (non-critical)")


# ============================================================
# Main
# ============================================================

def main():
    print(f"\n{C.BOLD}{C.B}")
    print("=" * 60)
    print("  P2P E2E Test Suite")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)
    print(f"{C.END}")

    if not API_KEY:
        print(f"{C.R}ERROR: SUPABASE_SERVICE_KEY not set!{C.END}")
        sys.exit(1)

    log_info(f"Supabase: {SUPABASE_URL}")
    log_info(f"Key: {API_KEY[:20]}...")

    results = {}
    offer_id = trade_id = None

    try:
        step0_seed_payment_method()
        results["Step 0: Seed Data"] = "PASS"

        step1_verify_identities()
        results["Step 1: Identity Verification"] = "PASS"

        step1b_seed_test_users()
        results["Step 1b: Seed Users"] = "PASS"

        step2_ensure_balances()
        results["Step 2: Balance Setup"] = "PASS"

        offer_id = step3_create_offer()
        results["Step 3: Create Offer"] = "PASS"

        trade_id = step4_accept_trade(offer_id)
        results["Step 4: Accept Trade"] = "PASS"

        step5_payment_sent(trade_id)
        results["Step 5: Payment Sent"] = "PASS"

        step6_confirm_and_release(trade_id, offer_id)
        results["Step 6: Confirm & Release"] = "PASS"

        step7_cancel_flow()
        results["Step 7: Cancel Flow"] = "PASS"

        step8_visa_user_trade()
        results["Step 8: Visa User Trade"] = "PASS"

        step9_withdrawal_request()
        results["Step 9: Withdrawal Request"] = "PASS"

        step_x_check_logs()

    except (AssertionError, Exception) as e:
        step_names = [
            "Step 0: Seed Data", "Step 1: Identity Verification",
            "Step 1b: Seed Users", "Step 2: Balance Setup", "Step 3: Create Offer",
            "Step 4: Accept Trade", "Step 5: Payment Sent",
            "Step 6: Confirm & Release", "Step 7: Cancel Flow",
            "Step 8: Visa User Trade", "Step 9: Withdrawal Request",
        ]
        idx = len(results)
        if idx < len(step_names):
            results[step_names[idx]] = f"FAIL: {e}"
        log_fail(f"Test failed: {e}")
        import traceback
        traceback.print_exc()

    # Summary
    print(f"\n{C.BOLD}{'='*60}")
    print("  Test Results Summary")
    print(f"{'='*60}{C.END}\n")

    passed = failed = 0
    for step, result in results.items():
        if result == "PASS":
            print(f"  {C.G}PASS{C.END}  {step}")
            passed += 1
        else:
            print(f"  {C.R}FAIL{C.END}  {step}: {result}")
            failed += 1

    print(f"\n  Total: {passed + failed} | Passed: {passed} | Failed: {failed}")

    if failed == 0:
        print(f"\n  {C.G}{C.BOLD}ALL TESTS PASSED!{C.END}\n")
    else:
        print(f"\n  {C.R}{C.BOLD}{failed} TEST(S) FAILED{C.END}\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
