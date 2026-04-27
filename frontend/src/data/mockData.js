export const mockProjects = [
  {
    id: 'p1',
    name: 'PROJECT_ROGER',
    indexFileId: '1',
    files: [
      {
        id: '1',
        name: 'Index.md',
        content: '# Project Roger Index\n\nCentral directive for HUD development.\n\n## Sub-modules\n- [[System Architecture]]\n- [[Security Layer]]\n\nRefer to [[Network Map]] for topology.',
      },
      {
        id: '2',
        name: 'System Architecture.md',
        content: '# System Architecture\n\nMinimalist military HUD design. No gradients. Jet black and copper yellow only.\n\nSee [[Security Layer]] for encryption specs.',
      },
      {
        id: '3',
        name: 'Security Layer.md',
        content: '# Security Layer\n\nAES-256 enabled. Bio-metric handshake required.\n\nLink to evidence: [[IMG_001]]',
      }
    ]
  },
  {
    id: 'p2',
    name: 'NETWORK_INTEL',
    indexFileId: '4',
    files: [
      {
        id: '4',
        name: 'Main_Frame.md',
        content: '# Network Intel Main Frame\n\nMonitoring all sector nodes.\n\n## Active Nodes\n- [[Sector 7]]\n- [[Sector 4]]\n\nCheck [[Topology Config]] for mapping.',
      },
      {
        id: '5',
        name: 'Sector 7.md',
        content: '# Sector 7\n\nStatus: Online\nNode ID: ALPHA\n\nConnected to [[Sector 4]].',
      },
      {
        id: '6',
        name: 'Sector 4.md',
        content: '# Sector 4\n\nStatus: Warning\nNode ID: BETA\n\nRequires maintenance. See [[IMG_004]] for sensor glitch.',
      },
      {
        id: '7',
        name: 'Topology Config.md',
        content: '# Topology Config\n\nStandard military mesh network configuration.',
      }
    ]
  }
];

export const mockImages = [
  {
    id: 'img1',
    name: 'IMG_001.jpg',
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=300&q=80',
    category: 'SYSTEM',
    links: ['3'] 
  },
  {
    id: 'img2',
    name: 'IMG_002.jpg',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=300&q=80',
    category: 'SATELLITE',
    links: ['2']
  },
  {
    id: 'img3',
    name: 'IMG_003.jpg',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc51?auto=format&fit=crop&w=300&q=80',
    category: 'HARDWARE',
    links: ['1']
  },
  {
    id: 'img4',
    name: 'IMG_004.jpg',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=300&q=80',
    category: 'HARDWARE',
    links: ['6']
  },
  {
    id: 'img5',
    name: 'IMG_005.jpg',
    url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=300&q=80',
    category: 'SYSTEM',
    links: ['4']
  }
];

export const mockTasks = [
  { 
    id: 't1', 
    title: 'Initialize ROGER_CORE', 
    status: 'done', 
    project: 'PROJECT_ROGER',
    date: '2026-04-27',
    startTime: '08:00',
    endTime: '09:30',
    description: 'Establish baseline neural handshake and core directive protocols.',
    refs: { files: ['1'], images: ['img3'] }
  },
  { 
    id: 't2', 
    title: 'Calibrate PTT_INTERFACE', 
    status: 'in-progress', 
    project: 'PROJECT_ROGER',
    date: '2026-04-27',
    startTime: '10:00',
    endTime: '11:00',
    description: 'Optimize Push-To-Talk latency and audio buffer synchronization.',
    refs: { files: ['2'], images: [] }
  },
  { 
    id: 't3', 
    title: 'Secure BIOS_GATEWAY', 
    status: 'todo', 
    project: 'PROJECT_ROGER',
    date: '2026-04-27',
    startTime: '13:00',
    endTime: '14:30',
    description: 'Implement multi-factor bio-metric authentication for system entry.',
    refs: { files: ['3'], images: ['img1'] }
  },
  { 
    id: 't4', 
    title: 'Sync SECTOR_NODES', 
    status: 'in-progress', 
    project: 'NETWORK_INTEL',
    date: '2026-04-27',
    startTime: '09:00',
    endTime: '11:00',
    description: 'Harmonize data throughput across all active sector nodes.',
    refs: { files: ['4', '7'], images: [] }
  },
  { 
    id: 't5', 
    title: 'Investigate S7_ANOMALY', 
    status: 'todo', 
    project: 'NETWORK_INTEL',
    date: '2026-04-27',
    startTime: '11:30',
    endTime: '12:30',
    description: 'Analyze spectral drift detected in Sector 7 node Alpha.',
    refs: { files: ['5'], images: [] }
  },
  { 
    id: 't6', 
    title: 'Refine GRAPH_VISUALS', 
    status: 'todo', 
    project: 'null',
    date: '2026-04-27',
    startTime: '15:00',
    endTime: '16:00',
    description: 'Enhance node scaling and link visibility in the network graph.',
    refs: { files: [], images: [] }
  },
  { 
    id: 't7', 
    title: 'Update HUD_PALETTE', 
    status: 'done', 
    project: 'null',
    date: '2026-04-26',
    startTime: '14:00',
    endTime: '15:00',
    description: 'Finalize copper yellow hex codes and jet black contrast ratios.',
    refs: { files: ['2'], images: [] }
  },
  { 
    id: 't8', 
    title: 'Decrypt VAULT_09', 
    status: 'todo', 
    project: 'null',
    date: '2026-04-27',
    startTime: '16:30',
    endTime: '18:00',
    description: 'Brute-force secondary encryption layer on identified ghost vault.',
    refs: { files: [], images: ['img2'] }
  },
  { 
    id: 't9', 
    title: 'Verify UPLINK_STABILITY', 
    status: 'in-progress', 
    project: 'NETWORK_INTEL',
    date: '2026-04-27',
    startTime: '14:00',
    endTime: '15:30',
    description: 'Stress-test satellite uplink under simulated atmospheric interference.',
    refs: { files: ['4'], images: [] }
  },
  { 
    id: 't10', 
    title: 'Finalize ROGER_INTEL', 
    status: 'todo', 
    project: 'PROJECT_ROGER',
    date: '2026-04-28',
    startTime: '09:00',
    endTime: '10:30',
    description: 'Package all project findings for high-level command review.',
    refs: { files: ['1'], images: [] }
  },
  { 
    id: 't11', 
    title: 'Monitor S4_RECOVERY', 
    status: 'todo', 
    project: 'NETWORK_INTEL',
    date: '2026-04-28',
    startTime: '11:00',
    endTime: '12:30',
    description: 'Track recovery progress of Sector 4 nodes.',
    refs: { files: ['6'], images: [] }
  },
  { 
    id: 't12', 
    title: 'Neural Sync Test B', 
    status: 'todo', 
    project: 'PROJECT_ROGER',
    date: '2026-04-29',
    startTime: '14:00',
    endTime: '16:00',
    description: 'Stress test second-stage neural links.',
    refs: { files: ['1'], images: [] }
  }
];
