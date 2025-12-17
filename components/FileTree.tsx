import React from 'react';
import { Folder, FileText, Image, ChevronRight, ChevronDown } from 'lucide-react';
import { FolderNode } from '../types';

interface FileTreeProps {
  node: FolderNode;
  level?: number;
}

const FileTree: React.FC<FileTreeProps> = ({ node, level = 0 }) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggleOpen = () => setIsOpen(!isOpen);

  const paddingLeft = `${level * 1.5}rem`;

  if (node.type === 'file') {
    return (
      <div className="flex items-center gap-2 py-1 hover:bg-white/5 text-gray-300 font-mono text-sm" style={{ paddingLeft }}>
        {node.name.endsWith('.png') ? <Image size={14} className="text-retro-amber" /> : <FileText size={14} className="text-blue-400" />}
        <span>{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center gap-2 py-1 hover:bg-white/5 cursor-pointer text-retro-green font-mono text-sm font-bold" 
        style={{ paddingLeft }}
        onClick={toggleOpen}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="fill-current" />
        <span>{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div>
          {node.children.map((child, idx) => (
            <FileTree key={idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTree;