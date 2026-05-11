import os
from supabase import create_client, Client

class Database:
    def __init__(self):

        self.supabase_url: str = os.environ.get("SUPABASE_URL", "https://fvariopykkztlmfaixxt.supabase.co")
        self.supabase_key: str = os.environ.get("SUPABASE_KEY", "sb_publishable_qPbh-7BxAjtUn9Dx-ptiVw_s93DKCUq")
        
        self.client: Client | None = None
        self.current_user = None
        
        if self.supabase_url and self.supabase_key:
            try:
                self.client = create_client(self.supabase_url, self.supabase_key)
                print(f"Connessione a Supabase riuscita! (Versione: {__import__('supabase').__version__})")
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Errore inizializzazione Supabase: {e}")

    def is_configured(self):
        return self.client is not None

    def login(self, email, password):
        if not self.client: raise Exception("Supabase non configurato")
        res = self.client.auth.sign_in_with_password({"email": email, "password": password})
        self.current_user = res.user
        return res

    def signup(self, email, password):
        if not self.client: raise Exception("Supabase non configurato")
        res = self.client.auth.sign_up({"email": email, "password": password})
        self.current_user = res.user
        return res
        
    def logout(self):
        if self.client:
            self.client.auth.sign_out()
            self.current_user = None

    # Categories CRUD
    def get_categories(self):
        if not self.client or not self.current_user: return []
        res = self.client.table("categories").select("*").execute()
        return res.data

    def add_category(self, name, parent_id=None):
        if not self.client or not self.current_user: return None
        data = {"name": name, "user_id": self.current_user.id}
        if parent_id:
            data["parent_id"] = parent_id
        res = self.client.table("categories").insert(data).execute()
        return res.data[0] if res.data else None

    def rename_category(self, category_id, new_name):
        if not self.client or not self.current_user: return None
        res = self.client.table("categories").update({"name": new_name}).eq("id", category_id).execute()
        return res.data[0] if res.data else None

    def delete_category(self, category_id):
        if not self.client or not self.current_user: return
        self.client.table("categories").delete().eq("id", category_id).execute()

    # Notes CRUD
    def get_notes(self, category_id=None, search_query=None):
        if not self.client or not self.current_user: return []
        query = self.client.table("notes").select("*")
        if category_id is not None:
            query = query.eq("category_id", category_id)
        if search_query:
            query = query.ilike("title", f"%{search_query}%")
        res = query.execute()
        return res.data

    def save_note(self, title, content, category_id, note_id=None):
        if not self.client or not self.current_user: return None
        data = {
            "title": title,
            "content": content,
            "category_id": category_id,
            "user_id": self.current_user.id
        }
        if note_id:
            res = self.client.table("notes").update(data).eq("id", note_id).execute()
        else:
            res = self.client.table("notes").insert(data).execute()
        return res.data[0] if res.data else None

    def delete_note(self, note_id):
        if not self.client or not self.current_user: return
        self.client.table("notes").delete().eq("id", note_id).execute()

    # Storage methods
    def upload_file(self, local_path, file_name):
        if not self.client or not self.current_user: return None
        storage_path = f"{self.current_user.id}/{file_name}"
        try:
            with open(local_path, 'rb') as f:
                res = self.client.storage.from_("appunti").upload(
                    file=f,
                    path=storage_path,
                    file_options={"cache-control": "3600", "upsert": "true"}
                )
            return storage_path
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise Exception(f"Errore caricamento file: {e}")

    def get_file_url(self, storage_path, download=False):
        if not self.client: return None
        options = {"download": True} if download else None
        return self.client.storage.from_("appunti").get_public_url(storage_path, options)

db = Database()
