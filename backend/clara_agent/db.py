import json
import sqlite3
from pathlib import Path
from typing import Any


DB_PATH = Path(__file__).resolve().parent.parent / "clara.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                index_file_id TEXT
            );

            CREATE TABLE IF NOT EXISTS note_files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                category TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS image_file_links (
                image_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                PRIMARY KEY (image_id, file_id),
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                FOREIGN KEY (file_id) REFERENCES note_files(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS image_dump_items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS mind_dump_entries (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                processed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                project TEXT NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                description TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS task_file_refs (
                task_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                PRIMARY KEY (task_id, file_id),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (file_id) REFERENCES note_files(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS task_image_refs (
                task_id TEXT NOT NULL,
                image_id TEXT NOT NULL,
                PRIMARY KEY (task_id, image_id),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS task_reschedule_history (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                from_date TEXT NOT NULL,
                from_start_time TEXT NOT NULL,
                from_end_time TEXT NOT NULL,
                to_date TEXT NOT NULL,
                to_start_time TEXT NOT NULL,
                to_end_time TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
            """
        )
        image_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(images)").fetchall()
        }
        if "metadata" not in image_columns:
            connection.execute(
                "ALTER TABLE images ADD COLUMN metadata TEXT NOT NULL DEFAULT ''"
            )


def _task_from_row(
    row: sqlite3.Row,
    file_ids: list[str],
    image_ids: list[str],
    reschedule_history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "project": row["project"],
        "date": row["date"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "description": row["description"],
        "refs": {
            "files": file_ids,
            "images": image_ids,
        },
        "rescheduleHistory": reschedule_history or [],
    }


def list_projects() -> list[dict[str, Any]]:
    with get_connection() as connection:
        project_rows = connection.execute(
            "SELECT id, name, index_file_id FROM projects ORDER BY rowid"
        ).fetchall()
        file_rows = connection.execute(
            """
            SELECT id, project_id, name, content
            FROM note_files
            ORDER BY project_id, sort_order, rowid
            """
        ).fetchall()

    files_by_project: dict[str, list[dict[str, Any]]] = {}
    for row in file_rows:
        files_by_project.setdefault(row["project_id"], []).append(
            {
                "id": row["id"],
                "name": row["name"],
                "content": row["content"],
            }
        )

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "indexFileId": row["index_file_id"],
            "files": files_by_project.get(row["id"], []),
        }
        for row in project_rows
    ]


def create_project(project_id: str, name: str, details: str) -> dict[str, Any]:
    index_file_id = f"{project_id}_index"
    index_content = f"# {name} Index\n\n{details.strip() or 'Project details go here.'}"

    with get_connection() as connection:
        connection.execute(
            "INSERT INTO projects (id, name, index_file_id) VALUES (?, ?, ?)",
            (project_id, name, index_file_id),
        )
        connection.execute(
            """
            INSERT INTO note_files (id, project_id, name, content, sort_order)
            VALUES (?, ?, ?, ?, 0)
            """,
            (index_file_id, project_id, "Index.md", index_content),
        )

    return {
        "id": project_id,
        "name": name,
        "indexFileId": index_file_id,
        "files": [
            {
                "id": index_file_id,
                "name": "Index.md",
                "content": index_content,
            }
        ],
    }


def delete_project(project_id: str) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM projects WHERE id = ?",
            (project_id,),
        )
        return cursor.rowcount > 0


def create_note_file(
    file_id: str,
    project_id: str,
    name: str,
    content: str,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        project = connection.execute(
            "SELECT id, index_file_id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if project is None:
            return None

        sort_order = connection.execute(
            "SELECT COUNT(*) AS count FROM note_files WHERE project_id = ?",
            (project_id,),
        ).fetchone()["count"]
        connection.execute(
            """
            INSERT INTO note_files (id, project_id, name, content, sort_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            (file_id, project_id, name, content, sort_order),
        )
        if project["index_file_id"] is None:
            connection.execute(
                "UPDATE projects SET index_file_id = ? WHERE id = ?",
                (file_id, project_id),
            )

    return {
        "id": file_id,
        "name": name,
        "content": content,
    }


def update_note_file(file_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    field_map = {
        "name": "name",
        "content": "content",
    }
    assignments = []
    values: list[Any] = []

    for api_field, column in field_map.items():
        if api_field in updates:
            assignments.append(f"{column} = ?")
            values.append(updates[api_field])

    if assignments:
        values.append(file_id)
        with get_connection() as connection:
            connection.execute(
                f"UPDATE note_files SET {', '.join(assignments)} WHERE id = ?",
                values,
            )

    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, content FROM note_files WHERE id = ?",
            (file_id,),
        ).fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "content": row["content"],
    }


def delete_note_file(file_id: str) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT project_id FROM note_files WHERE id = ?",
            (file_id,),
        ).fetchone()
        if row is None:
            return False

        project_id = row["project_id"]
        connection.execute(
            "DELETE FROM note_files WHERE id = ?",
            (file_id,),
        )
        replacement = connection.execute(
            """
            SELECT id FROM note_files
            WHERE project_id = ?
            ORDER BY sort_order, rowid
            LIMIT 1
            """,
            (project_id,),
        ).fetchone()
        connection.execute(
            "UPDATE projects SET index_file_id = ? WHERE id = ? AND index_file_id = ?",
            (replacement["id"] if replacement else None, project_id, file_id),
        )

    return True


def list_images() -> list[dict[str, Any]]:
    with get_connection() as connection:
        image_rows = connection.execute(
            "SELECT id, name, url, category, metadata FROM images ORDER BY rowid"
        ).fetchall()
        link_rows = connection.execute(
            "SELECT image_id, file_id FROM image_file_links ORDER BY image_id, file_id"
        ).fetchall()

    links_by_image: dict[str, list[str]] = {}
    for row in link_rows:
        links_by_image.setdefault(row["image_id"], []).append(row["file_id"])

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "url": row["url"],
            "category": row["category"],
            "metadata": row["metadata"],
            "links": links_by_image.get(row["id"], []),
        }
        for row in image_rows
    ]


def create_image(
    image_id: str,
    name: str,
    url: str,
    category: str,
    metadata: str,
) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO images (id, name, url, category, metadata)
            VALUES (?, ?, ?, ?, ?)
            """,
            (image_id, name, url, category, metadata),
        )

    return {
        "id": image_id,
        "name": name,
        "url": url,
        "category": category,
        "metadata": metadata,
        "links": [],
    }


def get_image(image_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, url, category, metadata FROM images WHERE id = ?",
            (image_id,),
        ).fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "url": row["url"],
        "category": row["category"],
        "metadata": row["metadata"],
    }


def delete_image(image_id: str) -> dict[str, Any] | None:
    image = get_image(image_id)
    if image is None:
        return None

    with get_connection() as connection:
        connection.execute("DELETE FROM images WHERE id = ?", (image_id,))

    return image


def list_image_dump_items() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, url, created_at
            FROM image_dump_items
            ORDER BY datetime(created_at) DESC, rowid DESC
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "url": row["url"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def create_image_dump_item(item_id: str, name: str, url: str) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO image_dump_items (id, name, url) VALUES (?, ?, ?)",
            (item_id, name, url),
        )
        row = connection.execute(
            """
            SELECT id, name, url, created_at
            FROM image_dump_items
            WHERE id = ?
            """,
            (item_id,),
        ).fetchone()

    return {
        "id": row["id"],
        "name": row["name"],
        "url": row["url"],
        "createdAt": row["created_at"],
    }


def get_image_dump_item(item_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, url, created_at
            FROM image_dump_items
            WHERE id = ?
            """,
            (item_id,),
        ).fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "url": row["url"],
        "createdAt": row["created_at"],
    }


def delete_image_dump_item(item_id: str) -> dict[str, Any] | None:
    item = get_image_dump_item(item_id)
    if item is None:
        return None

    with get_connection() as connection:
        connection.execute("DELETE FROM image_dump_items WHERE id = ?", (item_id,))

    return item


def _mind_dump_entry_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "content": row["content"],
        "processed": bool(row["processed"]),
        "createdAt": row["created_at"],
    }


def list_mind_dump_entries() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, content, processed, created_at
            FROM mind_dump_entries
            ORDER BY datetime(created_at) DESC, rowid DESC
            """
        ).fetchall()

    return [_mind_dump_entry_from_row(row) for row in rows]


def create_mind_dump_entry(entry_id: str, content: str) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO mind_dump_entries (id, content) VALUES (?, ?)",
            (entry_id, content),
        )
        row = connection.execute(
            """
            SELECT id, content, processed, created_at
            FROM mind_dump_entries
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()

    return _mind_dump_entry_from_row(row)


def update_mind_dump_entry(entry_id: str, processed: bool) -> dict[str, Any] | None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE mind_dump_entries SET processed = ? WHERE id = ?",
            (1 if processed else 0, entry_id),
        )
        row = connection.execute(
            """
            SELECT id, content, processed, created_at
            FROM mind_dump_entries
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()

    return _mind_dump_entry_from_row(row) if row else None


def delete_mind_dump_entry(entry_id: str) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM mind_dump_entries WHERE id = ?",
            (entry_id,),
        )
        return cursor.rowcount > 0


def list_tasks() -> list[dict[str, Any]]:
    with get_connection() as connection:
        task_rows = connection.execute(
            """
            SELECT id, title, status, project, date, start_time, end_time, description
            FROM tasks
            ORDER BY date, start_time, sort_order, rowid
            """
        ).fetchall()
        file_ref_rows = connection.execute(
            "SELECT task_id, file_id FROM task_file_refs ORDER BY task_id, file_id"
        ).fetchall()
        image_ref_rows = connection.execute(
            "SELECT task_id, image_id FROM task_image_refs ORDER BY task_id, image_id"
        ).fetchall()
        history_rows = connection.execute(
            """
            SELECT
                id, task_id, from_date, from_start_time, from_end_time,
                to_date, to_start_time, to_end_time, reason, created_at
            FROM task_reschedule_history
            ORDER BY datetime(created_at), rowid
            """
        ).fetchall()

    files_by_task: dict[str, list[str]] = {}
    for row in file_ref_rows:
        files_by_task.setdefault(row["task_id"], []).append(row["file_id"])

    images_by_task: dict[str, list[str]] = {}
    for row in image_ref_rows:
        images_by_task.setdefault(row["task_id"], []).append(row["image_id"])

    history_by_task: dict[str, list[dict[str, Any]]] = {}
    for row in history_rows:
        history_by_task.setdefault(row["task_id"], []).append(
            {
                "id": row["id"],
                "from": {
                    "date": row["from_date"],
                    "startTime": row["from_start_time"],
                    "endTime": row["from_end_time"],
                },
                "to": {
                    "date": row["to_date"],
                    "startTime": row["to_start_time"],
                    "endTime": row["to_end_time"],
                },
                "reason": row["reason"],
                "createdAt": row["created_at"],
            }
        )

    return [
        _task_from_row(
            row,
            files_by_task.get(row["id"], []),
            images_by_task.get(row["id"], []),
            history_by_task.get(row["id"], []),
        )
        for row in task_rows
    ]


def create_task(task_id: str, task: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as connection:
        sort_order = connection.execute(
            "SELECT COUNT(*) AS count FROM tasks"
        ).fetchone()["count"]
        connection.execute(
            """
            INSERT INTO tasks (
                id, title, status, project, date, start_time, end_time,
                description, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                task["title"],
                task["status"],
                task["project"],
                task["date"],
                task["startTime"],
                task["endTime"],
                task["description"],
                sort_order,
            ),
        )

    return {
        "id": task_id,
        "title": task["title"],
        "status": task["status"],
        "project": task["project"],
        "date": task["date"],
        "startTime": task["startTime"],
        "endTime": task["endTime"],
        "description": task["description"],
        "refs": {"files": [], "images": []},
        "rescheduleHistory": [],
    }


def reschedule_task(
    task_id: str,
    history_id: str,
    date: str,
    start_time: str,
    end_time: str,
    reason: str,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT date, start_time, end_time
            FROM tasks
            WHERE id = ?
            """,
            (task_id,),
        ).fetchone()
        if row is None:
            return None

        connection.execute(
            """
            INSERT INTO task_reschedule_history (
                id, task_id, from_date, from_start_time, from_end_time,
                to_date, to_start_time, to_end_time, reason
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                history_id,
                task_id,
                row["date"],
                row["start_time"],
                row["end_time"],
                date,
                start_time,
                end_time,
                reason,
            ),
        )
        connection.execute(
            """
            UPDATE tasks
            SET date = ?, start_time = ?, end_time = ?
            WHERE id = ?
            """,
            (date, start_time, end_time, task_id),
        )

    return get_task(task_id)


def update_task(task_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    field_map = {
        "title": "title",
        "status": "status",
        "project": "project",
        "date": "date",
        "startTime": "start_time",
        "endTime": "end_time",
        "description": "description",
    }
    assignments = []
    values: list[Any] = []

    for api_field, column in field_map.items():
        if api_field in updates:
            assignments.append(f"{column} = ?")
            values.append(updates[api_field])

    if assignments:
        values.append(task_id)
        with get_connection() as connection:
            connection.execute(
                f"UPDATE tasks SET {', '.join(assignments)} WHERE id = ?",
                values,
            )

    return get_task(task_id)


def get_task(task_id: str) -> dict[str, Any] | None:
    return next((task for task in list_tasks() if task["id"] == task_id), None)


def reset_and_seed_database(seed_data: dict[str, Any]) -> None:
    initialize_database()
    with get_connection() as connection:
        connection.executescript(
            """
            DELETE FROM task_image_refs;
            DELETE FROM task_file_refs;
            DELETE FROM tasks;
            DELETE FROM task_reschedule_history;
            DELETE FROM image_file_links;
            DELETE FROM image_dump_items;
            DELETE FROM mind_dump_entries;
            DELETE FROM images;
            DELETE FROM note_files;
            DELETE FROM projects;
            """
        )

        for project in seed_data["projects"]:
            connection.execute(
                "INSERT INTO projects (id, name, index_file_id) VALUES (?, ?, ?)",
                (project["id"], project["name"], project["indexFileId"]),
            )
            for sort_order, file in enumerate(project["files"]):
                connection.execute(
                    """
                    INSERT INTO note_files (id, project_id, name, content, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        file["id"],
                        project["id"],
                        file["name"],
                        file["content"],
                        sort_order,
                    ),
                )

        for image in seed_data["images"]:
            connection.execute(
                """
                INSERT INTO images (id, name, url, category, metadata)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    image["id"],
                    image["name"],
                    image["url"],
                    image["category"],
                    image["metadata"],
                ),
            )
            for file_id in image["links"]:
                connection.execute(
                    "INSERT INTO image_file_links (image_id, file_id) VALUES (?, ?)",
                    (image["id"], file_id),
                )

        for sort_order, task in enumerate(seed_data["tasks"]):
            connection.execute(
                """
                INSERT INTO tasks (
                    id, title, status, project, date, start_time, end_time,
                    description, sort_order
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task["id"],
                    task["title"],
                    task["status"],
                    task["project"],
                    task["date"],
                    task["startTime"],
                    task["endTime"],
                    task["description"],
                    sort_order,
                ),
            )
            for file_id in task["refs"]["files"]:
                connection.execute(
                    "INSERT INTO task_file_refs (task_id, file_id) VALUES (?, ?)",
                    (task["id"], file_id),
                )
            for image_id in task["refs"]["images"]:
                connection.execute(
                    "INSERT INTO task_image_refs (task_id, image_id) VALUES (?, ?)",
                    (task["id"], image_id),
                )

        for entry in seed_data.get("mindDump", []):
            connection.execute(
                """
                INSERT INTO mind_dump_entries (id, content, processed, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    entry["id"],
                    entry["content"],
                    1 if entry["processed"] else 0,
                    entry["createdAt"],
                ),
            )


def database_summary() -> str:
    counts = {}
    with get_connection() as connection:
        for table in ("projects", "note_files", "images", "tasks"):
            counts[table] = connection.execute(
                f"SELECT COUNT(*) AS count FROM {table}"
            ).fetchone()["count"]
    return json.dumps(counts)
