import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { mockTasks, mockProjects, mockImages } from '../data/mockData';
import { Tag, FileText, Image as ImageIcon, X } from 'lucide-react';

const COLUMNS = [
  { id: 'todo', title: 'TODO_QUEUE' },
  { id: 'in-progress', title: 'IN_PROGRESS' },
  { id: 'done', title: 'COMPLETED' }
];

export default function TaskManagement() {
  const [tasks, setTasks] = useState(mockTasks);
  const [activeId, setActiveId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragStart = (event) => {
    setActiveId(event.active.id);
    setSelectedTaskId(event.active.id);
  };

  const onDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const isActiveATask = active.data.current?.type === 'Task';
    const isOverATask = over.data.current?.type === 'Task';

    if (!isActiveATask) return;

    if (isActiveATask && isOverATask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        if (tasks[activeIndex].status !== tasks[overIndex].status) {
          const newTasks = [...tasks];
          newTasks[activeIndex] = { ...newTasks[activeIndex], status: newTasks[overIndex].status };
          return arrayMove(newTasks, activeIndex, overIndex);
        }
        return arrayMove(tasks, activeIndex, overIndex);
      });
    }

    const isOverAColumn = over.data.current?.type === 'Column';
    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const newTasks = [...tasks];
        newTasks[activeIndex] = { ...newTasks[activeIndex], status: overId };
        return arrayMove(newTasks, activeIndex, activeIndex);
      });
    }
  };

  const onDragEnd = (event) => {
    setActiveId(null);
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  return (
    <div className="task-mgmt-container flush-layout">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="four-panel-grid">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasks.filter((t) => t.status === col.id)}
              onTaskClick={setSelectedTaskId}
              selectedTaskId={selectedTaskId}
            />
          ))}
          
          <div className="task-detail-panel panel-border">
            {selectedTask ? (
              <TaskDetail task={selectedTask} onClose={() => setSelectedTaskId(null)} />
            ) : (
              <div className="detail-placeholder">
                <span className="hud-label">NO_INTEL_SELECTED</span>
              </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
          }),
        }}>
          {activeId ? <TaskCard task={activeTask} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ column, tasks, onTaskClick, selectedTaskId }) {
  const { setNodeRef } = useSortable({
    id: column.id,
    data: { type: 'Column', column },
  });

  return (
    <div className="kanban-column panel-border" ref={setNodeRef}>
      <div className="column-header">
        <span className="column-dot"></span>
        <span className="hud-label">{column.title}</span>
        <span className="task-count">[{tasks.length}]</span>
      </div>
      <div className="column-tasks">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTask 
              key={task.id} 
              task={task} 
              onClick={() => onTaskClick(task.id)}
              isActive={selectedTaskId === task.id}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTask({ task, onClick, isActive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'Task', task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging) {
    return <div ref={setNodeRef} style={style} className="task-card-wrapper dragging-placeholder" />;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card-wrapper ${isActive ? 'active' : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </div>
  );
}

function TaskCard({ task, isOverlay }) {
  return (
    <div className={`task-card ${isOverlay ? 'overlay' : ''}`}>
      <div className="task-card-header">
        <span className="task-id">{task.id.toUpperCase()}</span>
        <span className="task-time">{task.startTime} - {task.endTime}</span>
      </div>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <div className={`project-tag ${task.project === 'null' ? 'null-tag' : ''}`}>
          <Tag size={10} />
          <span>{task.project}</span>
        </div>
        <div className="task-date">{task.date}</div>
      </div>
    </div>
  );
}

function TaskDetail({ task, onClose }) {
  const allFiles = useMemo(() => mockProjects.flatMap(p => p.files), []);
  const referencedFiles = useMemo(() => 
    task.refs.files.map(id => allFiles.find(f => f.id === id)).filter(Boolean),
    [task.refs.files, allFiles]
  );
  const referencedImages = useMemo(() => 
    task.refs.images.map(id => mockImages.find(img => img.id === id)).filter(Boolean),
    [task.refs.images]
  );

  return (
    <div className="task-detail">
      <div className="detail-header">
        <span className="hud-label">DOSSIER_{task.id.toUpperCase()}</span>
        <button className="hud-icon-button" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="detail-body">
        <h2 className="detail-title">{task.title}</h2>
        
        <div className="detail-grid">
          <div className="detail-section">
            <div className="hud-label">TEMPORAL_MARK</div>
            <div className="temporal-info">
              <div className="date">{task.date}</div>
              <div className="time">{task.startTime} - {task.endTime}</div>
            </div>
          </div>

          <div className="detail-section">
            <div className="hud-label">PROJECT_SOURCE</div>
            <div className={`project-tag ${task.project === 'null' ? 'null-tag' : ''}`} style={{marginTop: '8px'}}>
              <Tag size={10} />
              <span>{task.project}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <div className="hud-label">DIRECTIVE</div>
          <p className="detail-description">{task.description}</p>
        </div>
        {(referencedFiles.length > 0 || referencedImages.length > 0) && (
          <div className="detail-section">
            <div className="hud-label">REFERENCES</div>
            <div className="ref-list">
              {referencedFiles.map(file => (
                <div key={file.id} className="ref-item">
                  <FileText size={14} className="copper" />
                  <span>{file.name}</span>
                </div>
              ))}
              {referencedImages.map(img => (
                <div key={img.id} className="ref-item image-ref">
                  <ImageIcon size={14} className="copper" />
                  <span>{img.name}</span>
                  <div className="ref-thumb"><img src={img.url} alt={img.name} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
