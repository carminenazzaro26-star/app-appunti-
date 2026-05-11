# Versione aggiornata per forzare il build di Vercel - 21:58
import flet as ft
import flet.fastapi as flet_fastapi
from .database import db

def main(page: ft.Page):
    page.title = "App Appunti"
    page.theme_mode = ft.ThemeMode.LIGHT
    page.theme = ft.Theme(color_scheme_seed="#4C51F7", font_family="Roboto")
    page.bgcolor = "#F4F5F7"
    page.padding = 0

    # Stato applicazione
    state = {
        "current_category": None,
        "current_note": None,
        "is_mobile": page.width < 800 if page.width else False
    }

    # === VIEW LOGIN ===
    email_field = ft.TextField(label="Email", width=300, border_color=ft.colors.OUTLINE_VARIANT)
    password_field = ft.TextField(label="Password", password=True, width=300, border_color=ft.colors.OUTLINE_VARIANT)
    
    def on_login(e):
        try:
            db.login(email_field.value, password_field.value)
            page.go("/dashboard")
        except Exception as ex:
            page.snack_bar = ft.SnackBar(ft.Text(f"Errore: {ex}"))
            page.snack_bar.open = True
            page.update()

    login_view = ft.View(
        "/",
        [
            ft.Container(
                content=ft.Column([
                    ft.Container(
                        content=ft.Text("App Appunti", size=24, weight=ft.FontWeight.BOLD, color="white"),
                        bgcolor=ft.colors.PRIMARY,
                        padding=ft.padding.symmetric(horizontal=20, vertical=10),
                        border_radius=5,
                        margin=ft.margin.only(bottom=20)
                    ),
                    ft.Text("Accedi al tuo account", size=16, color=ft.colors.BLACK54),
                    email_field,
                    password_field,
                    ft.Row([
                        ft.ElevatedButton("Login", on_click=on_login, bgcolor=ft.colors.PRIMARY, color=ft.colors.ON_PRIMARY)
                    ], alignment=ft.MainAxisAlignment.CENTER)
                ], alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                bgcolor=ft.colors.WHITE,
                padding=40,
                border_radius=12,
                shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.colors.BLACK12),
                width=450
            )
        ],
        vertical_alignment=ft.MainAxisAlignment.CENTER,
        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
        bgcolor="#F4F5F7"
    )

    # === VIEW DASHBOARD ===
    
    # 1. Componenti Sidebar / Categorie
    categories_col = ft.Column(scroll=ft.ScrollMode.AUTO, expand=True)

    def load_categories():
        categories_col.controls.clear()
        cats = db.get_categories()
        
        cat_dict = {c["id"]: c for c in cats}
        tree = []
        for c in cats:
            if c["parent_id"] is None:
                tree.append(c)
            else:
                parent = cat_dict.get(c["parent_id"])
                if parent:
                    if "children" not in parent:
                        parent["children"] = []
                    parent["children"].append(c)
        
        def toggle_expanded(e, cid):
            if "expanded_categories" not in state:
                state["expanded_categories"] = set()
            if cid in state["expanded_categories"]:
                state["expanded_categories"].remove(cid)
            else:
                state["expanded_categories"].add(cid)
            load_categories()

        def build_ui_tree(nodes, depth=0):
            controls = []
            for n in nodes:
                cat_id = n["id"]
                is_selected = (state["current_category"] == cat_id)
                has_children = "children" in n and len(n["children"]) > 0
                
                if "expanded_categories" not in state:
                    state["expanded_categories"] = set()
                is_expanded = cat_id in state["expanded_categories"]
                
                if has_children:
                    toggle_icon = ft.icons.EXPAND_MORE if is_expanded else ft.icons.CHEVRON_RIGHT
                    toggle_btn = ft.IconButton(toggle_icon, icon_size=16, icon_color=ft.colors.BLACK54, on_click=lambda e, cid=cat_id: toggle_expanded(e, cid))
                else:
                    toggle_btn = ft.Container(width=40)

                row = ft.Container(
                    content=ft.Row([
                        toggle_btn,
                        ft.Icon(ft.icons.FOLDER_OPEN if is_selected else ft.icons.FOLDER, size=20, color=ft.colors.PRIMARY if is_selected else ft.colors.BLACK54),
                        ft.Text(n["name"], expand=True, color=ft.colors.PRIMARY if is_selected else ft.colors.BLACK87, weight=ft.FontWeight.BOLD if is_selected else ft.FontWeight.NORMAL),
                        ft.IconButton(ft.icons.DELETE, icon_size=16, icon_color=ft.colors.BLACK38, on_click=lambda e, cid=cat_id: delete_cat_click(cid), tooltip="Elimina Categoria")
                    ]),
                    padding=ft.padding.only(left=depth * 15),
                    on_click=lambda e, cid=cat_id: select_category(cid),
                    bgcolor=ft.colors.BLUE_50 if is_selected else ft.colors.TRANSPARENT,
                    border_radius=5,
                    ink=True
                )
                controls.append(row)
                if has_children and is_expanded:
                    controls.extend(build_ui_tree(n["children"], depth + 1))
            return controls

        categories_col.controls = build_ui_tree(tree)
        page.update()

    def select_category(cat_id):
        state["current_category"] = cat_id
        state["current_note"] = None
        file_title_text.value = "Nessun file selezionato"
        file_title_text.color = ft.colors.BLACK54
        file_preview_image.visible = False
        file_actions_row.visible = False
        load_categories() 
        load_notes()

    def delete_cat_click(cat_id):
        db.delete_category(cat_id)
        if state["current_category"] == cat_id:
            state["current_category"] = None
            notes_list_col.controls.clear()
        load_categories()

    # Finestra dialogo nuova categoria
    new_cat_name = ft.TextField(label="Nome Categoria", border_color=ft.colors.OUTLINE_VARIANT)
    
    def add_cat_click(e):
        if new_cat_name.value:
            try:
                res = db.add_category(new_cat_name.value, state["current_category"])
                if res is None:
                    raise Exception("Permesso negato o errore nel salvataggio.")
                new_cat_name.value = ""
                add_cat_dialog.open = False
                load_categories()
            except Exception as ex:
                page.snack_bar = ft.SnackBar(ft.Text(f"Errore: {ex}"))
                page.snack_bar.open = True
                page.update()
            
    add_cat_dialog = ft.AlertDialog(
        title=ft.Text("Nuova Categoria"),
        content=ft.Column([
            ft.Text("Selezionando una categoria creerai una sottocategoria.", size=12, color=ft.colors.BLACK54),
            new_cat_name
        ], tight=True),
        actions=[ft.TextButton("Aggiungi", on_click=add_cat_click)],
        bgcolor=ft.colors.WHITE
    )

    def open_add_cat_dialog(e):
        page.dialog = add_cat_dialog
        add_cat_dialog.open = True
        page.update()


    # 2. Componenti Lista Appunti
    def clear_search(e):
        search_field.value = ""
        search_field.update()
        load_notes()

    search_field = ft.TextField(
        label="Cerca appunti (premi Invio)...", 
        prefix_icon=ft.icons.SEARCH, 
        suffix=ft.IconButton(ft.icons.CLEAR, on_click=clear_search, icon_size=16),
        on_submit=lambda e: load_notes(), 
        border_color=ft.colors.OUTLINE_VARIANT, 
        width=350, 
        height=40, 
        content_padding=5, 
        text_size=14
    )
    notes_list_col = ft.Column(scroll=ft.ScrollMode.AUTO, expand=True)

    def load_notes():
        notes_list_col.controls.clear()
        
        if state["current_category"] is None and not search_field.value:
            notes_list_col.controls.append(ft.Text("Seleziona una categoria o usa la barra di ricerca.", italic=True, color=ft.colors.BLACK54))
            page.update()
            return
        
        # Se stiamo cercando qualcosa, ignoriamo il filtro categoria (ricerca globale)
        cat_to_search = state["current_category"] if not search_field.value else None
        
        notes = db.get_notes(category_id=cat_to_search, search_query=search_field.value)
        for n in notes:
            is_selected = state["current_note"] and state["current_note"]["id"] == n["id"]
            notes_list_col.controls.append(
                ft.ListTile(
                    title=ft.Text(n["title"], color=ft.colors.PRIMARY if is_selected else ft.colors.BLACK87, weight=ft.FontWeight.BOLD if is_selected else ft.FontWeight.NORMAL),
                    subtitle=ft.Text("📎 File allegato", color=ft.colors.BLACK54, size=12),
                    on_click=lambda e, note=n: select_note(note),
                    bgcolor=ft.colors.BLUE_50 if is_selected else ft.colors.TRANSPARENT,
                    hover_color=ft.colors.BLACK12
                )
            )
        page.update()


    # 3. Componenti Visualizzazione File
    file_title_text = ft.Text("Nessun file selezionato", size=20, weight=ft.FontWeight.BOLD, color=ft.colors.BLACK54)
    file_preview_image = ft.Image(visible=False, fit=ft.ImageFit.CONTAIN, height=300)
    file_actions_row = ft.Row(visible=False, alignment=ft.MainAxisAlignment.CENTER)

    def open_file_click(e):
        if state["current_note"] and state["current_note"]["content"]:
            url = db.get_file_url(state["current_note"]["content"], download=True)
            if url:
                page.launch_url(url)

    file_actions_row.controls = [
        ft.ElevatedButton("Scarica/Apri File", icon=ft.icons.DOWNLOAD, on_click=open_file_click, bgcolor=ft.colors.PRIMARY, color=ft.colors.ON_PRIMARY),
        ft.IconButton(ft.icons.DELETE, on_click=lambda e: delete_note_click(e), icon_color=ft.colors.ERROR, tooltip="Elimina Appunto")
    ]

    def select_note(note):
        state["current_note"] = note
        file_title_text.value = note["title"]
        file_title_text.color = ft.colors.BLACK87
        
        is_image = note["title"].lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))
        if is_image and note["content"]:
            url = db.get_file_url(note["content"])
            file_preview_image.src = url
            file_preview_image.visible = True
        else:
            file_preview_image.visible = False
            
        file_actions_row.visible = True
        load_notes()
        page.update()

    # Logica Caricamento File
    def on_file_picked(e: ft.FilePickerResultEvent):
        if not e.files or state["current_category"] is None: 
            return
        
        file_info = e.files[0]
        local_path = file_info.path
        file_name = file_info.name
        
        page.snack_bar = ft.SnackBar(ft.Text("Caricamento in corso..."))
        page.snack_bar.open = True
        page.update()
        
        try:
            storage_path = db.upload_file(local_path, file_name)
            if storage_path:
                saved_note = db.save_note(
                    title=file_name,
                    content=storage_path, 
                    category_id=state["current_category"]
                )
                if saved_note:
                    page.snack_bar = ft.SnackBar(ft.Text("File caricato con successo!"))
                    page.snack_bar.open = True
                    select_note(saved_note)
        except Exception as ex:
            page.snack_bar = ft.SnackBar(ft.Text(f"Errore durante il caricamento: {ex}"))
            page.snack_bar.open = True
            page.update()

    file_picker = ft.FilePicker(on_result=on_file_picked)
    page.overlay.append(file_picker)

    def new_note_click(e):
        if state["current_category"] is None:
            page.snack_bar = ft.SnackBar(ft.Text("Seleziona una categoria prima di caricare un file."))
            page.snack_bar.open = True
            page.update()
            return
        file_picker.pick_files(allow_multiple=False)

    def delete_note_click(e):
        if state["current_note"]:
            db.delete_note(state["current_note"]["id"])
            state["current_note"] = None
            file_title_text.value = "Nessun file selezionato"
            file_title_text.color = ft.colors.BLACK54
            file_preview_image.visible = False
            file_actions_row.visible = False
            load_notes()

    def logout_click(e):
        db.logout()
        page.go("/")

    # HEADER SUPERIORE
    header = ft.Container(
        content=ft.Row([
            # Left side
            ft.Row([
                ft.Container(
                    content=ft.Text("App Appunti", size=18, weight=ft.FontWeight.BOLD, color="white"),
                    bgcolor=ft.colors.PRIMARY,
                    padding=ft.padding.symmetric(horizontal=15, vertical=8),
                    border_radius=5
                ),
            ]),
            # Center Search
            search_field,
            # Right side
            ft.Row([
                ft.Container(
                    content=ft.Text("+ Carica Appunto", color="white", weight=ft.FontWeight.W_500),
                    bgcolor=ft.colors.PRIMARY,
                    padding=ft.padding.symmetric(horizontal=12, vertical=8),
                    border_radius=5,
                    on_click=new_note_click,
                    ink=True
                ),
                ft.Container(
                    content=ft.Text("Esci", color="white", weight=ft.FontWeight.W_500),
                    bgcolor=ft.colors.PRIMARY,
                    padding=ft.padding.symmetric(horizontal=12, vertical=8),
                    border_radius=5,
                    on_click=logout_click,
                    ink=True
                )
            ])
        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
        bgcolor=ft.colors.WHITE,
        padding=ft.padding.symmetric(horizontal=20, vertical=15),
        shadow=ft.BoxShadow(spread_radius=1, blur_radius=5, color=ft.colors.BLACK12)
    )

    # Intestazione Benvenuto
    welcome_text = ft.Text("", size=22, weight=ft.FontWeight.BOLD, color=ft.colors.BLACK87)
    welcome_area = ft.Container(
        content=ft.Column([
            welcome_text,
            ft.Row([
                ft.Text("Ruolo attivo:", color=ft.colors.BLACK54, size=13),
                ft.Container(
                    content=ft.Text("Studente", color=ft.colors.PRIMARY, size=12, weight=ft.FontWeight.BOLD),
                    bgcolor=ft.colors.BLUE_50,
                    padding=ft.padding.symmetric(horizontal=8, vertical=2),
                    border_radius=10
                )
            ])
        ]),
        padding=ft.padding.only(left=20, top=20, bottom=10)
    )

    # Sidebar (Categorie) re-styled
    sidebar = ft.Container(
        content=ft.Column([
            ft.Row([ft.Text("Categorie", size=18, weight=ft.FontWeight.BOLD, color=ft.colors.BLACK87), ft.IconButton(ft.icons.ADD, on_click=open_add_cat_dialog, icon_color=ft.colors.PRIMARY)]),
            ft.Divider(color=ft.colors.BLACK12),
            categories_col
        ]),
        width=250,
        bgcolor=ft.colors.WHITE,
        padding=15,
        border_radius=8,
        shadow=ft.BoxShadow(spread_radius=1, blur_radius=5, color=ft.colors.BLACK12),
        margin=ft.margin.only(left=20, bottom=20, right=10),
        visible=not state["is_mobile"]
    )

    # Lista Appunti Card
    list_card = ft.Container(
        content=notes_list_col,
        bgcolor=ft.colors.WHITE,
        padding=10,
        border_radius=8,
        shadow=ft.BoxShadow(spread_radius=1, blur_radius=5, color=ft.colors.BLACK12),
        expand=True
    )

    # Preview Card
    preview_card = ft.Container(
        content=ft.Column([
            file_title_text,
            ft.Divider(color=ft.colors.BLACK12),
            file_preview_image,
            file_actions_row
        ], alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
        bgcolor=ft.colors.WHITE,
        padding=20,
        border_radius=8,
        shadow=ft.BoxShadow(spread_radius=1, blur_radius=5, color=ft.colors.BLACK12),
        expand=True,
        margin=ft.margin.only(left=10)
    )

    main_area = ft.Container(
        content=ft.Row([
            ft.Column([list_card], expand=1),
            ft.Column([preview_card], expand=1)
        ], expand=True),
        expand=True,
        margin=ft.margin.only(right=20, bottom=20)
    )

    dashboard_view = ft.View(
        "/dashboard",
        [
            header,
            welcome_area,
            ft.Row([
                sidebar,
                main_area
            ], expand=True, vertical_alignment=ft.CrossAxisAlignment.START)
        ],
        padding=0,
        bgcolor="#F4F5F7"
    )

    # Gestione Routing
    def route_change(e):
        page.views.clear()
        page.views.append(login_view)
        if page.route == "/dashboard":
            if not db.current_user:
                page.go("/")
                return
            welcome_text.value = f"Benvenuto, {db.current_user.email}"
            page.views.append(dashboard_view)
            load_categories()
            load_notes()
        page.update()

    def view_pop(e):
        page.views.pop()
        top_view = page.views[-1]
        page.go(top_view.route)

    # Gestione Responsività
    def on_resize(e):
        is_mobile = page.width < 800
        if is_mobile != state["is_mobile"]:
            state["is_mobile"] = is_mobile
            sidebar.visible = not is_mobile
            page.update()

    page.on_route_change = route_change
    page.on_view_pop = view_pop
    page.on_resize = on_resize

    if not db.is_configured():
        page.add(
            ft.Container(
                content=ft.Column([
                    ft.Icon(ft.icons.ERROR_OUTLINE, color=ft.colors.ERROR, size=50),
                    ft.Text("Configurazione Mancante", size=30, weight=ft.FontWeight.BOLD),
                    ft.Text(
                        "Le variabili d'ambiente SUPABASE_URL e SUPABASE_KEY non sono state trovate.\n"
                        "Assicurati di averle caricate correttamente nel pannello di controllo di Vercel.",
                        text_align=ft.TextAlign.CENTER,
                        size=16
                    )
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                alignment=ft.alignment.center,
                expand=True
            )
        )
        return

    page.go(page.route)

# Esportazione standard per Vercel
app = flet_fastapi.app(main)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app)
