"use client";

import React, { useState, useEffect } from "react";
import { FileUpload } from "./ui/file-upload";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
  downloadURLs: string[];
}

export function FileUploadComponent() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
    downloadURLs: [],
  });

  const handleFileUpload = (newFiles: File[]) => {
    setFiles(newFiles);
  };

  useEffect(() => {
    const uploadFiles = async () => {
      if (files.length === 0) return;

      setUploadState({
        uploading: true,
        progress: 0,
        error: null,
        success: false,
        downloadURLs: [],
      });

      try {
        console.log("Uploading files:", files);
        const downloadURLs: string[] = [];
        

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filepath = `uploads/${Date.now()}_${file.name}`;
          
          console.log("Uploading file:", file.name);
          
          // Create a storage reference
          const storageRef = ref(storage, filepath);
          
          // Create upload task
          const uploadTask = uploadBytesResumable(storageRef, file);
          
          // Wait for upload to complete
          await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                // Calculate progress for this file
                const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                
                // Calculate overall progress
                const overallProgress = ((i * 100) + fileProgress) / files.length;
                
                setUploadState(prev => ({
                  ...prev,
                  progress: Math.round(overallProgress),
                }));
                
                console.log(`Upload is ${fileProgress}% done`);
              },
              (error) => {
                console.error("Upload error:", error);
                setUploadState(prev => ({
                  ...prev,
                  uploading: false,
                  error: error.message,
                  success: false,
                }));
                reject(error);
              },
              async () => {
                // Upload completed successfully
                try {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  downloadURLs.push(downloadURL);
                  console.log('File available at:', downloadURL);
                  resolve(downloadURL);
                } catch (error) {
                  console.error("Error getting download URL:", error);
                  reject(error);
                }
              }
            );
          });
        }

        // All files uploaded successfully
        setUploadState(prev => ({
          ...prev,
          uploading: false,
          success: true,
          error: null,
          progress: 100,
          downloadURLs,
        }));

        // Optional: Clear files after successful upload
        setFiles([]);

      } catch (error) {
        console.error("Upload failed:", error);
        setUploadState(prev => ({
          ...prev,
          uploading: false,
          error: error instanceof Error ? error.message : 'Upload failed',
          success: false,
        }));
      }
    };

    uploadFiles();
  }, [files]);

  return (
    <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white dark:bg-[#866ec7] border-neutral-200 dark:border-[#8160dd] rounded-lg">
      <div className="p-6">
        <FileUpload onChange={handleFileUpload} />

        {/* Upload Progress */}
        {uploadState.uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-[#866ec7] h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              Uploading: {uploadState.progress}%
            </p>
          </div>
        )}

        {/* Success Message */}
        {uploadState.success && (
          <div className="mt-4 p-4 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-100 rounded-lg">
            <p className="font-medium">Files uploaded successfully!</p>
            {uploadState.downloadURLs.length > 0 && (
              <div className="mt-2">
                <p className="text-sm">Download URLs:</p>
                <ul className="mt-1 space-y-1">
                  {uploadState.downloadURLs.map((url, index) => (
                    <li key={index} className="text-xs">
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                      >
                        File {index + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {uploadState.error && (
          <div className="mt-4 p-4 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-100 rounded-lg">
            Error: {uploadState.error}
          </div>
        )}

        {/* File List */}
        {files.length > 0 && !uploadState.success && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Selected Files:
            </h3>
            <ul className="mt-2 space-y-2">
              {files.map((file, index) => (
                <li
                  key={index}
                  className="text-sm text-gray-600 dark:text-gray-300"
                >
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}