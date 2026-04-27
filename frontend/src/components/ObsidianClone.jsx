import { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ForceGraph2D from 'react-force-graph-2d';
import { FileText, Share2, Eye, Edit3, Grid, Folder, ChevronRight, ChevronDown, Award, Plus, X, Trash2, Brain } from 'lucide-react';
import { createFile, createMindDumpEntry, createProject, deleteFile, deleteImage, deleteImageDumpItem, deleteMindDumpEntry, deleteProject, getImageDump, getImages, getMindDump, getProjects, resolveAssetUrl, updateFile, updateMindDumpEntry, uploadImage, uploadImageDumpItem } from '../data/api';

export default function ObsidianClone() {
  const [projects, setProjects] = useState([]);
  const [images, setImages] = useState([]);
  const [imageDump, setImageDump] = useState([]);
  const [mindDump, setMindDump] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [viewMode, setViewMode] = useState('editor'); 
  const [isPreview, setIsPreview] = useState(true);
  const [expandedImage, setExpandedImage] = useState(null);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDumpUploadOpen, setIsDumpUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [dumpUploadFile, setDumpUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('USER_UPLOAD');
  const [uploadMetadata, setUploadMetadata] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isDraggingDumpUpload, setIsDraggingDumpUpload] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDetails, setProjectDetails] = useState('');
  const [fileProjectId, setFileProjectId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isMindDumpCreateOpen, setIsMindDumpCreateOpen] = useState(false);
  const [expandedMindDump, setExpandedMindDump] = useState(null);
  const [mindDumpContent, setMindDumpContent] = useState('');
  const [mindDumpFilter, setMindDumpFilter] = useState('unprocessed');
  const [draftContent, setDraftContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getProjects(), getImages(), getImageDump(), getMindDump()])
      .then(([projectData, imageData, imageDumpData, mindDumpData]) => {
        if (cancelled) return;
        setProjects(projectData);
        setImages(imageData);
        setImageDump(imageDumpData);
        setMindDump(mindDumpData);
        setSelectedFileId(projectData[0]?.files[0]?.id || null);
        setExpandedProjects(projectData[0] ? { [projectData[0].id]: true } : {});
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setImages([]);
        setImageDump([]);
        setMindDump([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allFiles = useMemo(() => projects.flatMap(p => p.files), [projects]);
  const allProjectFiles = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      p.files.forEach(f => {
        map[f.id] = { ...f, projectId: p.id, isIndex: p.indexFileId === f.id };
      });
    });
    return map;
  }, [projects]);

  const categories = useMemo(() => {
    const cats = new Set(images.map(img => img.category));
    return ['ALL', ...Array.from(cats)];
  }, [images]);
  
  const selectedFile = useMemo(() => allProjectFiles[selectedFileId], [selectedFileId, allProjectFiles]);

  useEffect(() => {
    setDraftContent(selectedFile?.content || '');
    setIsDirty(false);
  }, [selectedFileId, selectedFile?.content]);

  const filteredImages = useMemo(() => {
    if (selectedCategory === 'ALL') return images;
    return images.filter(img => img.category === selectedCategory);
  }, [selectedCategory, images]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile || !uploadMetadata.trim() || isUploading) return;

    setIsUploading(true);
    try {
      const image = await uploadImage(uploadFile, uploadCategory, uploadMetadata);
      setImages(prev => [...prev, image]);
      setSelectedCategory(image.category);
      setUploadFile(null);
      setUploadCategory('USER_UPLOAD');
      setUploadMetadata('');
      setIsUploadOpen(false);
      setIsDraggingUpload(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDumpUpload = async (event) => {
    event.preventDefault();
    if (!dumpUploadFile || isUploading) return;

    setIsUploading(true);
    try {
      const item = await uploadImageDumpItem(dumpUploadFile);
      setImageDump(prev => [item, ...prev]);
      setDumpUploadFile(null);
      setIsDumpUploadOpen(false);
      setIsDraggingDumpUpload(false);
      setViewMode('dump');
    } finally {
      setIsUploading(false);
    }
  };

  const selectUploadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadFile(file);
  };

  const selectDumpUploadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setDumpUploadFile(file);
  };

  const filteredMindDump = useMemo(() => {
    if (mindDumpFilter === 'all') return mindDump;
    const processed = mindDumpFilter === 'processed';
    return mindDump.filter(entry => entry.processed === processed);
  }, [mindDump, mindDumpFilter]);

  const handleCreateProject = async (event) => {
    event.preventDefault();
    const project = await createProject(projectName, projectDetails);
    setProjects(prev => [...prev, project]);
    setExpandedProjects(prev => ({ ...prev, [project.id]: true }));
    setSelectedFileId(project.indexFileId);
    setViewMode('editor');
    setProjectName('');
    setProjectDetails('');
    setIsProjectCreateOpen(false);
  };

  const handleCreateFile = async (event) => {
    event.preventDefault();
    if (!fileProjectId) return;
    const file = await createFile(fileProjectId, fileName);
    setProjects(prev => prev.map(project => {
      if (project.id !== fileProjectId) return project;
      return {
        ...project,
        indexFileId: project.indexFileId || file.id,
        files: [...project.files, file],
      };
    }));
    setSelectedFileId(file.id);
    setViewMode('editor');
    setFileProjectId(null);
    setFileName('');
  };

  const handleCreateMindDump = async (event) => {
    event.preventDefault();
    const entry = await createMindDumpEntry(mindDumpContent);
    setMindDump(prev => [entry, ...prev]);
    setMindDumpContent('');
    setIsMindDumpCreateOpen(false);
  };

  const handleToggleMindDumpProcessed = async (entry) => {
    const updated = await updateMindDumpEntry(entry.id, { processed: !entry.processed });
    setMindDump(prev => prev.map(item => item.id === updated.id ? updated : item));
  };

  const handleDeleteImage = async (imageId) => {
    await deleteImage(imageId);
    setImages(prev => prev.filter(image => image.id !== imageId));
    setExpandedImage(prev => prev?.id === imageId ? null : prev);
  };

  const handleDeleteImageDumpItem = async (itemId) => {
    await deleteImageDumpItem(itemId);
    setImageDump(prev => prev.filter(item => item.id !== itemId));
    setExpandedImage(prev => prev?.id === itemId ? null : prev);
  };

  const handleDeleteMindDump = async (entryId) => {
    await deleteMindDumpEntry(entryId);
    setMindDump(prev => prev.filter(entry => entry.id !== entryId));
    setExpandedMindDump(prev => prev?.id === entryId ? null : prev);
  };

  const handleDeleteProject = async (projectId) => {
    const project = projects.find(item => item.id === projectId);
    const deletedFileIds = new Set(project?.files.map(file => file.id) || []);
    await deleteProject(projectId);

    setProjects(prev => {
      const nextProjects = prev.filter(item => item.id !== projectId);
      if (deletedFileIds.has(selectedFileId)) {
        setSelectedFileId(nextProjects[0]?.files[0]?.id || null);
      }
      return nextProjects;
    });
    setExpandedProjects(prev => {
      const nextExpanded = { ...prev };
      delete nextExpanded[projectId];
      return nextExpanded;
    });
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    await deleteFile(selectedFile.id);
    setProjects(prev => {
      const nextProjects = prev.map(project => {
        const files = project.files.filter(file => file.id !== selectedFile.id);
        return {
          ...project,
          indexFileId: project.indexFileId === selectedFile.id ? (files[0]?.id || null) : project.indexFileId,
          files,
        };
      });
      const nextFile = nextProjects.flatMap(project => project.files)[0];
      setSelectedFileId(nextFile?.id || null);
      return nextProjects;
    });
  };

  const replaceFileInProjects = (file) => {
    setProjects(prev => prev.map(project => ({
      ...project,
      files: project.files.map(existingFile => (
        existingFile.id === file.id ? file : existingFile
      )),
    })));
  };

  const handleSaveFile = async () => {
    if (!selectedFile || isSavingFile) return;

    setIsSavingFile(true);
    try {
      const file = await updateFile(selectedFile.id, { content: draftContent });
      replaceFileInProjects(file);
      setIsDirty(false);
    } finally {
      setIsSavingFile(false);
    }
  };

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Pre-load images for the graph
  const imageElements = useMemo(() => {
    const elements = {};
    images.forEach(img => {
      const el = new Image();
      el.src = resolveAssetUrl(img.url);
      elements[img.id] = el;
    });
    return elements;
  }, [images]);

  // Parse links for the graph
  const graphData = useMemo(() => {
    const nodes = [
      ...allFiles.map(f => ({ 
        id: f.id, 
        name: f.name.replace('.md', ''), 
        type: 'file',
        isIndex: allProjectFiles[f.id].isIndex
      })),
      ...images.map(img => ({ id: img.id, name: img.name, type: 'image', url: resolveAssetUrl(img.url) }))
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
        const targetImage = images.find(img => img.name.replace('.jpg', '') === targetName);
        if (targetImage) {
          links.push({ source: file.id, target: targetImage.id });
        }
      }
    });

    images.forEach(img => {
      img.links.forEach(fileId => {
        links.push({ source: img.id, target: fileId });
      });
    });

    return { nodes, links };
  }, [allFiles, allProjectFiles, images]);

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

  if (!selectedFile) {
    return (
      <div className="obsidian-container">
        <div className="detail-placeholder">
          <span className="hud-label">LOADING_INTEL_ARCHIVE</span>
        </div>
      </div>
    );
  }

  return (
    <div className="obsidian-container">
      {expandedImage && (
        <div className="hud-modal-overlay" onClick={() => setExpandedImage(null)}>
          <div className="hud-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">{expandedImage.name}</span>
              <button
                className="hud-icon-button danger"
                onClick={() => (
                  expandedImage.id.startsWith('dump_')
                    ? handleDeleteImageDumpItem(expandedImage.id)
                    : handleDeleteImage(expandedImage.id)
                )}
                title="Delete image"
              >
                <Trash2 size={16} />
              </button>
              <button className="hud-button" onClick={() => setExpandedImage(null)}>CLOSE</button>
            </div>
            <img src={resolveAssetUrl(expandedImage.url)} alt={expandedImage.name} className="modal-image" />
            {expandedImage.metadata && (
              <div className="modal-metadata">
                {expandedImage.metadata}
              </div>
            )}
          </div>
        </div>
      )}

      {isUploadOpen && (
        <div className="hud-modal-overlay" onClick={() => setIsUploadOpen(false)}>
          <form className="hud-modal-content upload-modal" onSubmit={handleUpload} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">UPLOAD_VISUAL_INTEL</span>
              <button type="button" className="hud-icon-button" onClick={() => setIsUploadOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label
              className={`upload-dropzone ${isDraggingUpload ? 'dragging' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingUpload(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingUpload(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDraggingUpload(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingUpload(false);
                selectUploadFile(event.dataTransfer.files?.[0]);
              }}
            >
              <span className="hud-label">IMAGE_FILE</span>
              <div className="dropzone-copy">
                <strong>{uploadFile ? uploadFile.name : 'DROP_IMAGE_HERE'}</strong>
                <span>{uploadFile ? 'Ready for upload' : 'or click to browse your computer'}</span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(event) => selectUploadFile(event.target.files?.[0])}
              />
            </label>
            <label className="upload-field">
              <span className="hud-label">CATEGORY</span>
              <input
                type="text"
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value)}
                placeholder="USER_UPLOAD"
              />
            </label>
            <label className="upload-field">
              <span className="hud-label">IMAGE_METADATA_REQUIRED</span>
              <textarea
                value={uploadMetadata}
                onChange={(event) => setUploadMetadata(event.target.value)}
                placeholder="Type any useful description, context, observations, tags, source notes, or future filing hints for this gallery image."
              />
            </label>
            <button type="submit" className="hud-button" disabled={!uploadFile || !uploadMetadata.trim() || isUploading}>
              {isUploading ? 'UPLOADING...' : 'UPLOAD_IMAGE'}
            </button>
          </form>
        </div>
      )}

      {isDumpUploadOpen && (
        <div className="hud-modal-overlay" onClick={() => setIsDumpUploadOpen(false)}>
          <form className="hud-modal-content upload-modal" onSubmit={handleDumpUpload} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">DUMP_RAW_IMAGE</span>
              <button type="button" className="hud-icon-button" onClick={() => setIsDumpUploadOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label
              className={`upload-dropzone ${isDraggingDumpUpload ? 'dragging' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingDumpUpload(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingDumpUpload(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDraggingDumpUpload(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingDumpUpload(false);
                selectDumpUploadFile(event.dataTransfer.files?.[0]);
              }}
            >
              <span className="hud-label">UNPROCESSED_IMAGE</span>
              <div className="dropzone-copy">
                <strong>{dumpUploadFile ? dumpUploadFile.name : 'DROP_RAW_IMAGE_HERE'}</strong>
                <span>{dumpUploadFile ? 'Ready for dump' : 'or click to browse your computer'}</span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(event) => selectDumpUploadFile(event.target.files?.[0])}
              />
            </label>
            <button type="submit" className="hud-button" disabled={!dumpUploadFile || isUploading}>
              {isUploading ? 'DUMPING...' : 'ADD_TO_IMAGE_DUMP'}
            </button>
          </form>
        </div>
      )}

      {fileProjectId && (
        <div className="hud-modal-overlay" onClick={() => setFileProjectId(null)}>
          <form className="hud-modal-content upload-modal" onSubmit={handleCreateFile} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">CREATE_NOTE_FILE</span>
              <button type="button" className="hud-icon-button" onClick={() => setFileProjectId(null)}>
                <X size={16} />
              </button>
            </div>
            <label className="upload-field">
              <span className="hud-label">FILE_NAME</span>
              <input
                type="text"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="Mission Brief.md"
                autoFocus
              />
            </label>
            <button type="submit" className="hud-button" disabled={!fileName.trim()}>
              CREATE_FILE
            </button>
          </form>
        </div>
      )}

      {isProjectCreateOpen && (
        <div className="hud-modal-overlay" onClick={() => setIsProjectCreateOpen(false)}>
          <form className="hud-modal-content task-create-modal" onSubmit={handleCreateProject} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">CREATE_PROJECT_INDEX</span>
              <button type="button" className="hud-icon-button" onClick={() => setIsProjectCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="upload-field">
              <span className="hud-label">PROJECT_NAME</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="PROJECT_NAME"
                autoFocus
              />
            </label>
            <label className="upload-field">
              <span className="hud-label">BASIC_DETAILS_FOR_INDEX</span>
              <textarea
                value={projectDetails}
                onChange={(event) => setProjectDetails(event.target.value)}
                placeholder="Type anything useful about this project. This becomes the mandatory Index.md starter content."
              />
            </label>
            <button type="submit" className="hud-button" disabled={!projectName.trim() || !projectDetails.trim()}>
              CREATE_PROJECT_AND_INDEX
            </button>
          </form>
        </div>
      )}

      {isMindDumpCreateOpen && (
        <div className="hud-modal-overlay" onClick={() => setIsMindDumpCreateOpen(false)}>
          <form className="hud-modal-content task-create-modal" onSubmit={handleCreateMindDump} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">NEW_MIND_DUMP</span>
              <button type="button" className="hud-icon-button" onClick={() => setIsMindDumpCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="upload-field">
              <span className="hud-label">RAW_THOUGHT</span>
              <textarea
                value={mindDumpContent}
                onChange={(event) => setMindDumpContent(event.target.value)}
                placeholder="Dump whatever is in your head right now..."
                autoFocus
              />
            </label>
            <button className="hud-button" type="submit" disabled={!mindDumpContent.trim()}>
              ADD_TO_MIND_DUMP
            </button>
          </form>
        </div>
      )}

      {expandedMindDump && (
        <div className="hud-modal-overlay" onClick={() => setExpandedMindDump(null)}>
          <div className="hud-modal-content mind-dump-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="hud-label">{expandedMindDump.processed ? 'PROCESSED_MIND_DUMP' : 'UNPROCESSED_MIND_DUMP'}</span>
              <button
                className="hud-icon-button danger"
                onClick={() => handleDeleteMindDump(expandedMindDump.id)}
                title="Delete mind dump"
              >
                <Trash2 size={16} />
              </button>
              <button type="button" className="hud-button" onClick={() => setExpandedMindDump(null)}>CLOSE</button>
            </div>
            <div className="history-stamp">{expandedMindDump.createdAt}</div>
            <div className="mind-dump-full-text">{expandedMindDump.content}</div>
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
          <button className="sidebar-create-button" onClick={() => setIsProjectCreateOpen(true)}>
            <Plus size={14} />
            <span>NEW_PROJECT</span>
          </button>
          <div className="project-list">
            {projects.map(project => (
              <div key={project.id} className="project-group">
                <div 
                  className="project-item"
                  onClick={() => toggleProject(project.id)}
                >
                  {expandedProjects[project.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={14} />
                  <span>{project.name}</span>
                  <button
                    className="inline-plus"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFileProjectId(project.id);
                    }}
                    title="Create file"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    className="inline-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                    title="Delete project"
                  >
                    <Trash2 size={12} />
                  </button>
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
            <div 
              className={`file-item ${viewMode === 'dump' ? 'active' : ''}`}
              onClick={() => setViewMode('dump')}
            >
              <Grid size={14} />
              <span>Image Dump</span>
            </div>
            <div 
              className={`file-item ${viewMode === 'mind-dump' ? 'active' : ''}`}
              onClick={() => setViewMode('mind-dump')}
            >
              <Brain size={14} />
              <span>Mind Dump</span>
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
                <button className="hud-button micro" onClick={() => setIsUploadOpen(true)} title="Upload Image">
                  <Plus size={12} />
                </button>
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
                  <div
                    key={img.id}
                    className="image-card"
                    onClick={() => setExpandedImage(img)}
                  >
                    <button
                      className="card-delete-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteImage(img.id);
                      }}
                      title="Delete image"
                    >
                      <Trash2 size={13} />
                    </button>
                    <img src={resolveAssetUrl(img.url)} alt={img.name} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewMode === 'dump' ? (
          <div className="gallery-container">
            <div className="content-header">
              <span className="hud-label">IMAGE_DUMP_UNPROCESSED</span>
              <button className="hud-button micro" onClick={() => setIsDumpUploadOpen(true)} title="Dump Image">
                <Plus size={12} />
              </button>
            </div>
            <div className="content-body">
              <div className="image-grid">
                {imageDump.map(item => (
                  <div
                    key={item.id}
                    className="image-card"
                    onClick={() => setExpandedImage(item)}
                  >
                    <button
                      className="card-delete-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteImageDumpItem(item.id);
                      }}
                      title="Delete dump image"
                    >
                      <Trash2 size={13} />
                    </button>
                    <img src={resolveAssetUrl(item.url)} alt={item.name} />
                  </div>
                ))}
              </div>
              {imageDump.length === 0 && (
                <div className="detail-placeholder">
                  <span className="hud-label">NO_RAW_IMAGES_DUMPED</span>
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'mind-dump' ? (
          <div className="gallery-container">
            <div className="content-header">
              <span className="hud-label">MIND_DUMP_RAW_THOUGHTS</span>
              <div className="filter-bar">
                <button className="hud-button micro" onClick={() => setIsMindDumpCreateOpen(true)} title="Add Mind Dump">
                  <Plus size={12} />
                </button>
                {['unprocessed', 'processed', 'all'].map(filter => (
                  <button
                    key={filter}
                    className={`hud-button micro ${mindDumpFilter === filter ? 'active' : ''}`}
                    onClick={() => setMindDumpFilter(filter)}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="content-body mind-dump-body">
              <div className="mind-dump-list">
                {filteredMindDump.map(entry => (
                  <div
                    key={entry.id}
                    className={`mind-dump-card ${entry.processed ? 'processed' : ''}`}
                    onClick={() => setExpandedMindDump(entry)}
                  >
                    <div className="mind-dump-card-header">
                      <span className="hud-label">{entry.processed ? 'PROCESSED' : 'UNPROCESSED'}</span>
                      <button
                        className="hud-button micro"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleMindDumpProcessed(entry);
                        }}
                      >
                        {entry.processed ? 'MARK_UNPROCESSED' : 'MARK_PROCESSED'}
                      </button>
                      <button
                        className="hud-icon-button danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteMindDump(entry.id);
                        }}
                        title="Delete mind dump"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p>{entry.content}</p>
                    <div className="history-stamp">{entry.createdAt}</div>
                  </div>
                ))}
                {filteredMindDump.length === 0 && (
                  <div className="detail-placeholder">
                    <span className="hud-label">NO_MIND_DUMP_ENTRIES</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="editor-container">
            <div className="content-header">
              <span className="hud-label">{selectedFile.name.toUpperCase()}</span>
              <div className="view-controls">
                {!isPreview && (
                  <button
                    className={`hud-button micro ${isDirty ? 'active' : ''}`}
                    onClick={handleSaveFile}
                    disabled={!isDirty || isSavingFile}
                  >
                    {isSavingFile ? 'SAVING...' : 'SAVE'}
                  </button>
                )}
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
                <button
                  className="hud-icon-button danger"
                  onClick={handleDeleteFile}
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="content-body">
              {isPreview ? (
                <div className="markdown-preview">
                  <ReactMarkdown>{draftContent}</ReactMarkdown>
                </div>
              ) : (
                <textarea 
                  className="markdown-editor"
                  value={draftContent}
                  onChange={(event) => {
                    setDraftContent(event.target.value);
                    setIsDirty(true);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
