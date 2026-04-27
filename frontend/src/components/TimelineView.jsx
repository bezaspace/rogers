import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { mockTasks } from '../data/mockData';
import { Clock, Tag } from 'lucide-react';

const HOURS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
});

const DAYS = ['2026-04-27', '2026-04-28', '2026-04-29'];

export default function TimelineView() {
  const [tasks, setTasks] = useState(mockTasks);
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 }
  }));

  const onDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    // Extract day and time from over.id (format: "day|time")
    const [newDay, newTime] = over.id.split('|');
    
    setTasks(prev => prev.map(task => {
      if (task.id === active.id) {
        // Calculate duration to maintain it
        const [sh, sm] = task.startTime.split(':').map(Number);
        const [eh, em] = task.endTime.split(':').map(Number);
        const durationMins = (eh * 60 + em) - (sh * 60 + sm);

        const [nh, nm] = newTime.split(':').map(Number);
        const totalEndMins = (nh * 60 + nm) + durationMins;
        const newEndH = Math.floor(totalEndMins / 60).toString().padStart(2, '0');
        const newEndM = (totalEndMins % 60).toString().padStart(2, '0');

        return {
          ...task,
          date: newDay,
          startTime: newTime,
          endTime: `${newEndH}:${newEndM}`
        };
      }
      return task;
    }));
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="timeline-container multi-day">
      <div className="timeline-header">
        <div className="hud-label">TEMPORAL_GRID_MULTI_SEGMENT</div>
      </div>
      
      <div className="timeline-workspace">
        <div className="time-axis">
          {HOURS.map(time => (
            <div key={time} className="time-slot-label">{time}</div>
          ))}
        </div>

        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCorners} 
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="days-grid">
            {DAYS.map(day => (
              <TimelineDay 
                key={day} 
                day={day} 
                tasks={tasks.filter(t => t.date === day)} 
              />
            ))}
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="timeline-task-card overlay" style={{ width: '240px', height: '80px' }}>
                <div className="timeline-task-inner">
                  <div className="task-id">{activeTask.id.toUpperCase()}</div>
                  <div className="task-title-short">{activeTask.title}</div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

function TimelineDay({ day, tasks }) {
  return (
    <div className="timeline-day-column">
      <div className="day-header hud-label">{day}</div>
      <div className="day-grid-container">
        {HOURS.map(time => (
          <TimeSlot key={`${day}|${time}`} id={`${day}|${time}`} />
        ))}
        <div className="tasks-layer">
          {tasks.map(task => (
            <DraggableTask key={task.id} task={task} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimeSlot({ id }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      className={`time-slot-line ${isOver ? 'slot-over' : ''}`}
    />
  );
}

function DraggableTask({ task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const top = (timeToMinutes(task.startTime) / 30) * 40;
  const height = ((timeToMinutes(task.endTime) - timeToMinutes(task.startTime)) / 30) * 40;

  const style = {
    top: `${top}px`,
    height: `${height}px`,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="timeline-task-card"
      {...listeners} 
      {...attributes}
    >
      <div className="timeline-task-inner">
        <div className="task-id">{task.id.toUpperCase()}</div>
        <div className="task-title-short">{task.title}</div>
        <div className="task-time-range">{task.startTime} - {task.endTime}</div>
        <div className={`project-tag micro ${task.project === 'null' ? 'null-tag' : ''}`}>
          <span>{task.project}</span>
        </div>
      </div>
    </div>
  );
}
