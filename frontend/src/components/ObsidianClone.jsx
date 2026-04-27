import { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ForceGraph2D from 'react-force-graph-2d';
import { FileText, Share2, Eye, Edit3, Image as ImageIcon, Grid, Folder, ChevronRight, ChevronDown, Award } from 'lucide-react';
import { mockProjects, mockImages } from '../data/mockData';

export default function ObsidianClone() {
  const allFiles = useMemo(() => mockProjects.flatMap(p => p.files), []);
  const allProjectFiles = useMemo(() => {
    const map = {};
    mockProjects.forEach(p => {
      p.files.forEach(f => {
        map[f.id] = { ...f, projectId: p.id, isIndex: p.indexFileId === f.id };
      });
    });
    return map;
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(mockImages.map(img => img.category));
    return ['ALL', ...Array.from(cats)];
  }, []);

  const [selectedFileId, setSelectedFileId] = useState(allFiles[0].id);
  const [viewMode, setViewMode] = useState('editor'); 
  const [isPreview, setIsPreview] = useState(true);
  const [expandedImage, setExpandedImage] = useState(null);
  const [expandedProjects, setExpandedProjects] = useState({ [mockProjects[0].id]: true });
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  const selectedFile = useMemo(() => allProjectFiles[selectedFileId], [selectedFileId, allProjectFiles]);

  const filteredImages = useMemo(() => {
    if (selectedCategory === 'ALL') return mockImages;
    return mockImages.filter(img => img.category === selectedCategory);
  }, [selectedCategory]);

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Pre-load images for the graph
  const imageElements = useMemo(() => {
    const images = {};
    mockImages.forEach(img => {
      const el = new Image();
      el.src = img.url;
      images[img.id] = el;
    });
    return images;
  }, []);

  // Parse links for the graph
  const graphData = useMemo(() => {
    const nodes = [
      ...allFiles.map(f => ({ 
        id: f.id, 
        name: f.name.replace('.md', ''), 
        type: 'file',
        isIndex: allProjectFiles[f.id].isIndex
      })),
      ...mockImages.map(img => ({ id: img.id, name: img.name, type: 'image', url: img.url }))
    ];
    
    const links = [];

    allFiles.forEach(file => {
      const linkRegex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = linkRegex.exec(file.content)) !== null) {
        const targetName = match[1];
        const targetFile = allFiles.find(f => f.name.replace('.md', '') === targetName);
        if (targetFile) {
          links.push({ source: file.id, target: targetFile.id });
        }
        const targetImage = mockImages.find(img => img.name.replace('.jpg', '') === targetName);
        if (targetImage) {
          links.push({ source: file.id, target: targetImage.id });
        }
      }
    });

    mockImages.forEach(img => {
      img.links.forEach(fileId => {
        links.push({ source: img.id, target: fileId });
      });
    });

    return { nodes, links };
  }, [allFiles, allProjectFiles]);

  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (viewMode === 'graph' && containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [viewMode]);

  const renderNode = (node, ctx, globalScale) => {
    if (node.type === 'image' && imageElements[node.id]) {
      const size = 30;
      try {
        ctx.save();
        ctx.strokeStyle = '#d49a3d';
        ctx.lineWidth = 1 / globalScale;
        ctx.strokeRect(node.x - size / 2, node.y - size / 2, size, size);
        ctx.drawImage(imageElements[node.id], node.x - size / 2, node.y - size / 2, size, size);
        ctx.restore();
      } catch (e) {
        ctx.fillStyle = '#d49a3d';
        ctx.fillRect(node.x - size / 2, node.y - size / 2, size, size);
      }
    } else {
      const label = node.name;
      const fontSize = 12/globalScale;
      ctx.font = `${fontSize}px JetBrains Mono`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = node.id === selectedFileId ? '#d49a3d' : '#ffffff';
      ctx.fillText(label, node.x, node.y + 12);
      
      ctx.fillStyle = node.id === selectedFileId ? '#d49a3d' : (node.isIndex ? '#d49a3d' : '#666666');
      if (node.isIndex) {
        // Draw diamond for index files
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI, false); ctx.fill();
      }
    }
  };

  return (
    <div className="obsidian-container">
      {expandedImage && (
        <div className="hud-modal-overlay" onClick={() => setExpandedImage(null)}>
          <div className="hud-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">{expandedImage.name}</span>
              <button className="hud-button" onClick={() => setExpandedImage(null)}>CLOSE</button>
            </div>
            <img src={expandedImage.url} alt={expandedImage.name} className="modal-image" />
          </div>
        </div>
      )}

      <div className="sidebar">
        <div className="sidebar-header">
          <span className="hud-label">EXPLORER</span>
          <button 
            className={`hud-icon-button ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'graph' ? 'editor' : 'graph')}
            title="Toggle Graph View"
          >
            <Share2 size={16} />
          </button>
        </div>
        
        <div className="sidebar-section">
          <div className="sidebar-section-header">PROJECTS</div>
          <div className="project-list">
            {mockProjects.map(project => (
              <div key={project.id} className="project-group">
                <div 
                  className="project-item"
                  onClick={() => toggleProject(project.id)}
                >
                  {expandedProjects[project.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={14} />
                  <span>{project.name}</span>
                </div>
                {expandedProjects[project.id] && (
                  <div className="project-files">
                    {project.files.map(file => (
                      <div 
                        key={file.id} 
                        className={`file-item ${viewMode === 'editor' && selectedFileId === file.id ? 'active' : ''} ${project.indexFileId === file.id ? 'index-file' : ''}`}
                        onClick={() => {
                          setSelectedFileId(file.id);
                          setViewMode('editor');
                        }}
                      >
                        {project.indexFileId === file.id ? <Award size={14} /> : <FileText size={14} />}
                        <span>{file.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">MEDIA_INTEL</div>
          <div className="file-list">
            <div 
              className={`file-item ${viewMode === 'gallery' ? 'active' : ''}`}
              onClick={() => setViewMode('gallery')}
            >
              <Grid size={14} />
              <span>Gallery</span>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        {viewMode === 'graph' ? (
          <div className="graph-container">
            <div className="content-header">
              <span className="hud-label">NETWORK_GRAPH</span>
              <button className="hud-button" onClick={() => setViewMode('editor')}>CLOSE_GRAPH</button>
            </div>
            <div className="graph-wrapper" ref={containerRef}>
              <ForceGraph2D
                graphData={graphData}
                nodeLabel="name"
                nodeCanvasObject={renderNode}
                nodePointerAreaPaint={(node, color, ctx) => {
                  const size = node.type === 'image' ? 30 : 8;
                  ctx.fillStyle = color;
                  if (node.type === 'image') {
                    ctx.fillRect(node.x - size / 2, node.y - size / 2, size, size);
                  } else {
                    ctx.beginPath(); ctx.arc(node.x, node.y, size/2, 0, 2 * Math.PI, false); ctx.fill();
                  }
                }}
                linkColor={() => '#222222'}
                backgroundColor="#000000"
                width={dimensions.width}
                height={dimensions.height}
                onNodeClick={(node) => {
                  if (node.type === 'file') {
                    setSelectedFileId(node.id);
                    setViewMode('editor');
                  } else {
                    setExpandedImage(node);
                  }
                }}
              />
            </div>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="gallery-container">
            <div className="content-header">
              <span className="hud-label">VISUAL_INTEL_ARCHIVE</span>
              <div className="filter-bar">
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    className={`hud-button micro ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="content-body">
              <div className="image-grid">
                {filteredImages.map(img => (
                  <div key={img.id} className="image-card" onClick={() => setExpandedImage(img)}>
                    <img src={img.url} alt={img.name} />
                    <div className="image-info">
                      <div className="img-name">{img.name}</div>
                      <div className="img-cat">[{img.category}]</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="editor-container">
            <div className="content-header">
              <span className="hud-label">{selectedFile.name.toUpperCase()}</span>
              <div className="view-controls">
                <button 
                  className={`hud-icon-button ${!isPreview ? 'active' : ''}`}
                  onClick={() => setIsPreview(false)}
                >
                  <Edit3 size={16} />
                </button>
                <button 
                  className={`hud-icon-button ${isPreview ? 'active' : ''}`}
                  onClick={() => setIsPreview(true)}
                >
                  <Eye size={16} />
                </button>
              </div>
            </div>
            
            <div className="content-body">
              {isPreview ? (
                <div className="markdown-preview">
                  <ReactMarkdown>{selectedFile.content}</ReactMarkdown>
                </div>
              ) : (
                <textarea 
                  className="markdown-editor"
                  value={selectedFile.content}
                  readOnly
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
