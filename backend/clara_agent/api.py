import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi import File
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from pydantic import BaseModel

from clara_agent.db import create_task
from clara_agent.db import create_image
from clara_agent.db import create_image_dump_item
from clara_agent.db import create_mind_dump_entry
from clara_agent.db import create_note_file
from clara_agent.db import create_project
from clara_agent.db import delete_image
from clara_agent.db import delete_image_dump_item
from clara_agent.db import delete_mind_dump_entry
from clara_agent.db import delete_note_file
from clara_agent.db import delete_project
from clara_agent.db import list_image_dump_items
from clara_agent.db import list_images
from clara_agent.db import list_mind_dump_entries
from clara_agent.db import list_projects
from clara_agent.db import list_tasks
from clara_agent.db import reschedule_task
from clara_agent.db import update_note_file
from clara_agent.db import update_mind_dump_entry
from clara_agent.db import update_task


router = APIRouter(prefix="/api")
IMAGES_DIR = Path(os.environ.get("ROGERS_IMAGES_DIR", Path.home() / "Rogers-Images"))
IMAGE_DUMP_DIR = Path(
    os.environ.get("ROGERS_IMAGE_DUMP_DIR", Path.home() / "Rogers-Image-Dump")
)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _delete_local_media_file(url: str, mount_prefix: str, directory: Path) -> None:
    if not url.startswith(mount_prefix):
        return

    file_name = Path(url.removeprefix(mount_prefix)).name
    if not file_name:
        return

    path = directory / file_name
    if path.exists() and path.is_file():
        path.unlink()


class TaskUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    project: str | None = None
    date: str | None = None
    startTime: str | None = None
    endTime: str | None = None
    description: str | None = None


class ProjectCreate(BaseModel):
    name: str
    details: str


class FileCreate(BaseModel):
    name: str
    content: str | None = None


class FileUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


class TaskCreate(BaseModel):
    title: str
    status: str = "todo"
    project: str = "null"
    date: str
    startTime: str
    endTime: str
    description: str = ""


class TaskReschedule(BaseModel):
    date: str
    startTime: str
    endTime: str
    reason: str


class MindDumpCreate(BaseModel):
    content: str


class MindDumpUpdate(BaseModel):
    processed: bool


@router.get("/projects")
def get_projects() -> list[dict[str, Any]]:
    return list_projects()


@router.post("/projects")
def post_project(payload: ProjectCreate) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")
    details = payload.details.strip()
    if not details:
        raise HTTPException(status_code=400, detail="Project details are required")

    return create_project(
        project_id=f"p_{uuid.uuid4().hex[:12]}",
        name=name,
        details=details,
    )


@router.delete("/projects/{project_id}")
def remove_project(project_id: str) -> dict[str, bool]:
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    return {"deleted": True}


@router.post("/projects/{project_id}/files")
def post_file(project_id: str, payload: FileCreate) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="File name is required")
    if not name.lower().endswith(".md"):
        name = f"{name}.md"

    title = name[:-3]
    content = payload.content
    if content is None:
        content = f"# {title}\n\nStart writing here."

    file = create_note_file(
        file_id=f"f_{uuid.uuid4().hex[:12]}",
        project_id=project_id,
        name=name,
        content=content,
    )
    if file is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return file


@router.patch("/files/{file_id}")
def patch_file(file_id: str, payload: FileUpdate) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(status_code=400, detail="File name is required")
        if not updates["name"].lower().endswith(".md"):
            updates["name"] = f"{updates['name']}.md"

    file = update_note_file(file_id, updates)
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    return file


@router.delete("/files/{file_id}")
def remove_file(file_id: str) -> dict[str, bool]:
    if not delete_note_file(file_id):
        raise HTTPException(status_code=404, detail="File not found")

    return {"deleted": True}


@router.get("/images")
def get_images() -> list[dict[str, Any]]:
    return list_images()


@router.post("/images")
def upload_image(
    file: UploadFile = File(...),
    category: str = Form("USER_UPLOAD"),
    metadata: str = Form(...),
) -> dict[str, Any]:
    metadata = metadata.strip()
    if not metadata:
        raise HTTPException(status_code=400, detail="Image metadata is required")

    original_name = Path(file.filename or "image").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    image_id = f"img_{uuid.uuid4().hex[:12]}"
    stored_name = f"{image_id}{extension}"
    destination = IMAGES_DIR / stored_name

    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    return create_image(
        image_id=image_id,
        name=original_name,
        url=f"/media/images/{stored_name}",
        category=category.strip().upper() or "USER_UPLOAD",
        metadata=metadata,
    )


@router.delete("/images/{image_id}")
def remove_image(image_id: str) -> dict[str, bool]:
    image = delete_image(image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    _delete_local_media_file(image["url"], "/media/images/", IMAGES_DIR)
    return {"deleted": True}


@router.get("/image-dump")
def get_image_dump() -> list[dict[str, Any]]:
    return list_image_dump_items()


@router.post("/image-dump")
def upload_image_dump_item(file: UploadFile = File(...)) -> dict[str, Any]:
    original_name = Path(file.filename or "image").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    IMAGE_DUMP_DIR.mkdir(parents=True, exist_ok=True)
    item_id = f"dump_{uuid.uuid4().hex[:12]}"
    stored_name = f"{item_id}{extension}"
    destination = IMAGE_DUMP_DIR / stored_name

    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    return create_image_dump_item(
        item_id=item_id,
        name=original_name,
        url=f"/media/image-dump/{stored_name}",
    )


@router.delete("/image-dump/{item_id}")
def remove_image_dump_item(item_id: str) -> dict[str, bool]:
    item = delete_image_dump_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Image dump item not found")

    _delete_local_media_file(item["url"], "/media/image-dump/", IMAGE_DUMP_DIR)
    return {"deleted": True}


@router.get("/mind-dump")
def get_mind_dump() -> list[dict[str, Any]]:
    return list_mind_dump_entries()


@router.post("/mind-dump")
def post_mind_dump(payload: MindDumpCreate) -> dict[str, Any]:
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mind dump content is required")

    return create_mind_dump_entry(
        entry_id=f"mind_{uuid.uuid4().hex[:12]}",
        content=content,
    )


@router.patch("/mind-dump/{entry_id}")
def patch_mind_dump(entry_id: str, payload: MindDumpUpdate) -> dict[str, Any]:
    entry = update_mind_dump_entry(entry_id, payload.processed)
    if entry is None:
        raise HTTPException(status_code=404, detail="Mind dump entry not found")

    return entry


@router.delete("/mind-dump/{entry_id}")
def remove_mind_dump(entry_id: str) -> dict[str, bool]:
    if not delete_mind_dump_entry(entry_id):
        raise HTTPException(status_code=404, detail="Mind dump entry not found")

    return {"deleted": True}


@router.get("/tasks")
def get_tasks() -> list[dict[str, Any]]:
    return list_tasks()


@router.post("/tasks")
def post_task(payload: TaskCreate) -> dict[str, Any]:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required")

    return create_task(
        task_id=f"t_{uuid.uuid4().hex[:12]}",
        task={
            "title": title,
            "status": payload.status,
            "project": payload.project.strip() or "null",
            "date": payload.date,
            "startTime": payload.startTime,
            "endTime": payload.endTime,
            "description": payload.description.strip(),
        },
    )


@router.post("/tasks/{task_id}/reschedule")
def post_task_reschedule(task_id: str, payload: TaskReschedule) -> dict[str, Any]:
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reschedule reason is required")

    task = reschedule_task(
        task_id=task_id,
        history_id=f"rh_{uuid.uuid4().hex[:12]}",
        date=payload.date,
        start_time=payload.startTime,
        end_time=payload.endTime,
        reason=reason,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return task


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskUpdate) -> dict[str, Any]:
    task = update_task(task_id, payload.model_dump(exclude_none=True))
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
