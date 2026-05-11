import os
import traceback
from supabase import create_client

supabase_url = "https://fvariopykkztlmfaixxt.supabase.co"
supabase_key = "sb_publishable_qPbh-7BxAjtUn9Dx-ptiVw_s93DKCUq"

try:
    client = create_client(supabase_url, supabase_key)
    res = client.storage.from_("appunti").get_public_url("some-uuid/my file with spaces.pdf")
    print("URL:", res)
except Exception as e:
    traceback.print_exc()
