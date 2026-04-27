import { useState } from 'react'
import VoiceAssistant from './components/VoiceAssistant'
import TextAssistant from './components/TextAssistant'
import ObsidianClone from './components/ObsidianClone'
import TaskManagement from './components/TaskManagement'
import TimelineView from './components/TimelineView'
import { Mic, Book, ListTodo, Clock } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('voice') // 'voice', 'notes', 'tasks', or 'timeline'
  const [assistantMode, setAssistantMode] = useState('voice')

  return (
    <div className="app-shell">
      {/* HUD Navigation */}
      <nav className="hud-nav">
        <div className="nav-brand">ROGERS_HUD v1.0</div>
        <div className="nav-links">
          <button 
            className={`nav-item ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            <Mic size={18} />
            <span>ASSISTANT</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            <Book size={18} />
            <span>NOTES_INTEL</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            <ListTodo size={18} />
            <span>TASK_STRATEGY</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Clock size={18} />
            <span>TIMELINE</span>
          </button>
        </div>
        <div className="nav-status">
          <span className="status-dot"></span>
          SYSTEM_ONLINE
        </div>
      </nav>

      <main className="content-area">
        {activeTab === 'voice' ? (
          <div className="assistant-tab-shell">
            <div className="assistant-mode-bar">
              <span className="hud-label">ASSISTANT_MODE</span>
              <button
                type="button"
                className={`assistant-toggle-button ${assistantMode === 'text' ? 'text-active' : 'voice-active'}`}
                onClick={() => setAssistantMode(assistantMode === 'voice' ? 'text' : 'voice')}
              >
                <span className="assistant-toggle-current">
                  {assistantMode === 'voice' ? 'VOICE_ASSISTANT' : 'TEXT_ASSISTANT'}
                </span>
                <span className="assistant-toggle-action">
                  {assistantMode === 'voice' ? 'SWITCH_TO_TEXT' : 'SWITCH_TO_VOICE'}
                </span>
              </button>
            </div>
            <div className="assistant-view">
              {assistantMode === 'voice' ? <VoiceAssistant /> : <TextAssistant />}
            </div>
          </div>
        ) : 
         activeTab === 'notes' ? <ObsidianClone /> : 
         activeTab === 'tasks' ? <TaskManagement /> : 
         <TimelineView />}
      </main>

      {/* Footer / Info Bar */}
      <footer className="hud-footer">
        <div className="footer-item">LATENCY: 12ms</div>
        <div className="footer-item">ENCRYPTION: ACTIVE</div>
        <div className="footer-item">{new Date().toLocaleTimeString()}</div>
      </footer>
    </div>
  )
}

export default App
