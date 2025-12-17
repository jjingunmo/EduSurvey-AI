import React, { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [disabled, onFilesSelected]);

  return (
    <div className="w-full">
      <label
        htmlFor="file-upload"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
          ${disabled 
            ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
            : isDragging
              ? 'bg-blue-100 border-blue-500 scale-[1.02]'
              : 'bg-white border-blue-300 hover:bg-blue-50 hover:border-blue-400'
          }`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
          <Upload className={`w-10 h-10 mb-3 ${disabled ? 'text-gray-400' : isDragging ? 'text-blue-600' : 'text-blue-500'}`} />
          <p className={`mb-2 text-sm font-medium ${disabled ? 'text-gray-500' : isDragging ? 'text-blue-700' : 'text-gray-500'}`}>
            <span className="font-semibold">클릭하여 업로드</span> 또는 파일을 드래그하세요
          </p>
          <p className={`text-xs ${disabled ? 'text-gray-400' : isDragging ? 'text-blue-600' : 'text-gray-400'}`}>
            PDF, JPG, PNG (다중 선택 가능)
          </p>
        </div>
        <input
          id="file-upload"
          type="file"
          className="hidden"
          multiple
          accept="application/pdf,image/*"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
    </div>
  );
};

export default FileUpload;