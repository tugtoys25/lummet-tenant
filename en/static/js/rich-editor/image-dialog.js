import { API_UPLOAD } from "/static/js/rich-editor/config.js";
import { showToast } from "/static/js/rich-editor/utils.js";
import { uploadImage, validateImageFile } from "/static/js/rich-editor/image-upload.js";

// ── Custom image upload handler for TinyMCE ────────

/**
 * Configures TinyMCE's image uploader to use our R2 API.
 * This replaces TinyMCE's default behavior of converting images to base64.
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {string} editorId - The editor instance ID.
 * @param {string} folder - The default upload folder.
 */
export function configureImageUpload(editor, editorId, folder) {
    // Handle images pasted or dragged into the editor
    editor.ui.registry.addButton('image', {
        icon: 'image',
        tooltip: 'Insert image',
        onAction: function () {
            openImageDialog(editor, editorId, folder);
        }
    });

    // Configure image upload handler (for drag & drop and paste)
    editor.options.set('images_upload_url', API_UPLOAD);
    editor.options.set('images_upload_credentials', true);

    // Custom upload handler — intercepts TinyMCE's image upload
    editor.options.set('images_upload_handler', function (blobInfo, progress) {
        return new Promise(function (resolve, reject) {
            var file = blobInfo.blob();
            var validation = validateImageFile(file);
            if (!validation.valid) {
                reject(validation.error);
                return;
            }

            uploadImage(file, folder).then(function (media) {
                resolve(media.url);
            }).catch(function (error) {
                reject(error.message || 'Upload failed');
            });
        });
    });
}

/**
 * Opens the image insertion dialog.
 * Provides two tabs: "Upload" (upload new image) and "Library" (pick from media library).
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {string} editorId - The editor instance ID.
 * @param {string} folder - The default upload folder.
 */
function openImageDialog(editor, editorId, folder) {
    // Check if media library picker is available (Phase 5)
    if (typeof window.MediaPicker !== 'undefined' && typeof window.MediaPicker.openImagePicker === 'function') {
        // Use the full media picker from Phase 5
        window.MediaPicker.openImagePicker(function (media) {
            insertImageIntoEditor(editor, media.url, media.alt_text || '', media.width, media.height);
        }, folder);
        return;
    }

    // Fallback: simple upload dialog
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        var validation = validateImageFile(file);
        if (!validation.valid) {
            showToast(validation.error, 'error');
            input.remove();
            return;
        }

        showToast('Uploading image...', 'info');

        uploadImage(file, folder).then(function (media) {
            insertImageIntoEditor(editor, media.url, '', media.width, media.height);
            showToast('Image uploaded successfully', 'success');
        }).catch(function (error) {
            showToast(error.message || 'Upload failed', 'error');
        }).finally(function () {
            input.remove();
        });
    });

    input.click();
}

/**
 * Inserts an image into the TinyMCE editor with proper attributes.
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {string} url - The image URL.
 * @param {string} alt - The alt text.
 * @param {number|null} width - Image width (optional).
 * @param {number|null} height - Image height (optional).
 */
export function insertImageIntoEditor(editor, url, alt, width, height) {
    var html = '<img src="' + url + '" alt="' + (alt || '') + '" loading="lazy"';
    if (width) html += ' width="' + width + '"';
    if (height) html += ' height="' + height + '"';
    html += ' />';
    editor.insertContent(html);
}
