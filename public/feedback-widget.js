(() => {
  if (!document.body || document.querySelector("[data-feedback-widget]")) return;

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const SUCCESS_VISIBLE_MS = 2_800;
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const FOCUSABLE_SELECTOR = 'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

  const root = document.createElement("div");
  root.dataset.feedbackWidget = "";
  root.innerHTML = `
    <button aria-haspopup="dialog" aria-label="Feedback" class="feedback-trigger ui-button ui-button--primary ui-button--pill" data-feedback-open type="button">
      <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="18"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 11.5z"></path></svg>
      <span>Feedback</span>
    </button>
    <div class="feedback-backdrop" data-feedback-backdrop hidden>
      <section aria-labelledby="feedback-title" aria-modal="true" class="feedback-dialog" role="dialog">
        <div class="feedback-heading">
          <div>
            <p>Beta feedback</p>
            <h2 id="feedback-title">Help improve Unmumble</h2>
          </div>
          <button aria-label="Close feedback" class="feedback-close ui-button ui-button--ghost ui-button--icon" data-feedback-close type="button">×</button>
        </div>
        <form data-feedback-form>
          <label>
            <span>What is this about?</span>
            <select class="ui-select" name="category">
              <option value="bug">🐛 Something is broken</option>
              <option value="idea">💡 I have an idea</option>
              <option value="other">💬 Something else</option>
            </select>
          </label>
          <label>
            <span>Tell us what happened or what you would like</span>
            <textarea class="ui-textarea" maxlength="2000" name="message" placeholder="A couple of sentences is enough." required rows="5"></textarea>
          </label>
          <label class="feedback-image-field">
            <span>Screenshot <small>Optional · JPEG, PNG or WebP · max 5 MB</small></span>
            <input accept="image/jpeg,image/png,image/webp" name="image" type="file" />
          </label>
          <div class="feedback-image-preview" data-feedback-image-preview hidden>
            <canvas aria-label="Selected feedback screenshot" data-feedback-image height="112" width="144"></canvas>
            <div>
              <span data-feedback-image-name></span>
              <button class="ui-button ui-button--ghost ui-button--sm" data-feedback-image-remove type="button">Remove</button>
            </div>
          </div>
          <label aria-hidden="true" class="feedback-honeypot">
            Website
            <input autocomplete="off" name="website" tabindex="-1" type="text" />
          </label>
          <p aria-live="polite" class="feedback-status" data-feedback-status role="status"></p>
          <button class="feedback-submit ui-button ui-button--primary ui-button--lg ui-button--block" type="submit">Send feedback</button>
        </form>
        <div aria-live="polite" class="feedback-success" data-feedback-success hidden role="status" tabindex="-1">
          <div aria-hidden="true" class="feedback-success-icon">
            <svg viewBox="0 0 48 48">
              <path d="M13 25l7 7 15-17"></path>
            </svg>
          </div>
          <h3>Feedback sent</h3>
          <p>Thanks — we received it.</p>
        </div>
      </section>
    </div>
  `;
  document.body.append(root);

  const trigger = root.querySelector("[data-feedback-open]");
  const backdrop = root.querySelector("[data-feedback-backdrop]");
  const dialog = root.querySelector(".feedback-dialog");
  const closeButton = root.querySelector("[data-feedback-close]");
  const form = root.querySelector("[data-feedback-form]");
  const message = root.querySelector('textarea[name="message"]');
  const imageInput = root.querySelector('input[name="image"]');
  const imagePreview = root.querySelector("[data-feedback-image-preview]");
  const imagePreviewElement = root.querySelector("[data-feedback-image]");
  const imageName = root.querySelector("[data-feedback-image-name]");
  const imageRemove = root.querySelector("[data-feedback-image-remove]");
  const status = root.querySelector("[data-feedback-status]");
  const submit = root.querySelector(".feedback-submit");
  const success = root.querySelector("[data-feedback-success]");
  let previousFocus = null;
  let imagePreviewGeneration = 0;
  let successTimer = null;

  function clearImage() {
    imagePreviewGeneration += 1;
    imageInput.value = "";
    imagePreviewElement.getContext("2d")?.clearRect(
      0,
      0,
      imagePreviewElement.width,
      imagePreviewElement.height,
    );
    imageName.textContent = "";
    imagePreview.hidden = true;
  }

  function resetSuccess() {
    if (successTimer !== null) window.clearTimeout(successTimer);
    successTimer = null;
    form.hidden = false;
    success.hidden = true;
  }

  function open() {
    resetSuccess();
    previousFocus = document.activeElement;
    backdrop.hidden = false;
    document.body.classList.add("feedback-open");
    message.focus();
  }

  function close() {
    backdrop.hidden = true;
    document.body.classList.remove("feedback-open");
    resetSuccess();
    previousFocus?.focus?.();
  }

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  imageInput.addEventListener("change", async () => {
    const image = imageInput.files?.[0];
    if (!image) {
      clearImage();
      return;
    }
    if (!IMAGE_TYPES.has(image.type)) {
      clearImage();
      status.textContent = "Attach a JPEG, PNG, or WebP image.";
      return;
    }
    if (image.size > MAX_IMAGE_BYTES) {
      clearImage();
      status.textContent = "Keep the image under 5 MB.";
      return;
    }
    status.textContent = "";
    const previewGeneration = ++imagePreviewGeneration;
    try {
      const bitmap = await createImageBitmap(image, {
        resizeWidth: 144,
        resizeHeight: 112,
        resizeQuality: "high",
      });
      if (previewGeneration !== imagePreviewGeneration) {
        bitmap.close();
        return;
      }
      imagePreviewElement.width = bitmap.width;
      imagePreviewElement.height = bitmap.height;
      const context = imagePreviewElement.getContext("2d");
      if (!context) {
        bitmap.close();
        clearImage();
        status.textContent = "Could not preview this image.";
        return;
      }
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      imageName.textContent = image.name;
      imagePreview.hidden = false;
    } catch {
      if (previewGeneration !== imagePreviewGeneration) return;
      clearImage();
      status.textContent = "Could not preview this image.";
    }
  });
  imageRemove.addEventListener("click", clearImage);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", (event) => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1) ?? first;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedImage = imageInput.files?.[0];
    data.set("pageUrl", window.location.href);
    data.delete("image");
    if (selectedImage) data.set("image", selectedImage, selectedImage.name);
    submit.disabled = true;
    status.textContent = "Sending…";
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "same-origin",
        body: data,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        status.textContent = result?.error || "Could not send feedback. Try again.";
        return;
      }
      form.reset();
      clearImage();
      status.textContent = "";
      form.hidden = true;
      success.hidden = false;
      success.focus();
      successTimer = window.setTimeout(() => {
        successTimer = null;
        close();
      }, SUCCESS_VISIBLE_MS);
    } catch {
      status.textContent = "Could not send feedback. Try again.";
    } finally {
      submit.disabled = false;
    }
  });
})();
