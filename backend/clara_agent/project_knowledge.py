import re
from typing import Any

from clara_agent.db import list_images
from clara_agent.db import list_mind_dump_entries
from clara_agent.db import list_projects
from clara_agent.db import list_tasks


WIKI_LINK_PATTERN = re.compile(r"\[\[(.*?)\]\]")


def _wiki_links(content: str) -> list[str]:
    return [match.strip() for match in WIKI_LINK_PATTERN.findall(content) if match.strip()]


def inspect_project_knowledge(question: str) -> dict[str, Any]:
    """Read all app projects, markdown files, and linked app context for answering questions.

    Args:
        question: The user's question or topic to answer from the current app data.

    Returns:
        A dictionary containing projects, files, wiki links, image metadata, task references, and mind-dump entries.
    """
    projects = list_projects()
    images = list_images()
    tasks = list_tasks()
    mind_dump = list_mind_dump_entries()

    files_by_id: dict[str, dict[str, Any]] = {}
    project_names_by_file_id: dict[str, str] = {}
    for project in projects:
        for file in project["files"]:
            files_by_id[file["id"]] = file
            project_names_by_file_id[file["id"]] = project["name"]

    images_by_id = {image["id"]: image for image in images}

    project_snapshots = []
    for project in projects:
        project_snapshots.append(
            {
                "id": project["id"],
                "name": project["name"],
                "indexFileId": project["indexFileId"],
                "files": [
                    {
                        "id": file["id"],
                        "name": file["name"],
                        "isIndex": file["id"] == project["indexFileId"],
                        "wikiLinks": _wiki_links(file["content"]),
                        "content": file["content"],
                    }
                    for file in project["files"]
                ],
            }
        )

    image_snapshots = []
    for image in images:
        linked_files = [
            {
                "id": file_id,
                "name": files_by_id[file_id]["name"],
                "project": project_names_by_file_id[file_id],
            }
            for file_id in image["links"]
            if file_id in files_by_id
        ]
        image_snapshots.append(
            {
                "id": image["id"],
                "name": image["name"],
                "category": image["category"],
                "metadata": image["metadata"],
                "url": image["url"],
                "linkedFiles": linked_files,
            }
        )

    task_snapshots = []
    for task in tasks:
        referenced_files = [
            {
                "id": file_id,
                "name": files_by_id[file_id]["name"],
                "project": project_names_by_file_id[file_id],
            }
            for file_id in task["refs"]["files"]
            if file_id in files_by_id
        ]
        referenced_images = [
            {
                "id": image_id,
                "name": images_by_id[image_id]["name"],
                "category": images_by_id[image_id]["category"],
                "metadata": images_by_id[image_id]["metadata"],
            }
            for image_id in task["refs"]["images"]
            if image_id in images_by_id
        ]
        task_snapshots.append(
            {
                "id": task["id"],
                "title": task["title"],
                "status": task["status"],
                "project": task["project"],
                "date": task["date"],
                "startTime": task["startTime"],
                "endTime": task["endTime"],
                "description": task["description"],
                "referencedFiles": referenced_files,
                "referencedImages": referenced_images,
                "rescheduleHistory": task["rescheduleHistory"],
            }
        )

    return {
        "status": "success",
        "question": question,
        "counts": {
            "projects": len(projects),
            "files": len(files_by_id),
            "images": len(images),
            "tasks": len(tasks),
            "mindDumpEntries": len(mind_dump),
        },
        "projects": project_snapshots,
        "images": image_snapshots,
        "tasks": task_snapshots,
        "mindDump": mind_dump,
    }
