<div class="image-workspace" id="image-edit-workspace" hidden role="dialog" aria-modal="true" aria-labelledby="image-edit-title">
    <div class="image-workspace-backdrop" data-cancel-image-edit></div>
    <section class="image-workspace-card image-edit-workspace-card">
        <header class="image-workspace-header"><div><span class="eyebrow">Precision background edit</span><h2 id="image-edit-title">Edit an area of the image</h2></div><button type="button" class="object-close" data-cancel-image-edit><i class="fa-solid fa-xmark"></i><span>Cancel</span></button></header>
        <div class="image-edit-layout">
            <div class="image-selection-stage"><div class="image-selection-canvas" id="image-edit-selection-canvas"><img id="image-edit-preview" alt="Image area editing preview"><svg id="image-edit-selection-layer" preserveAspectRatio="none" aria-label="Image edit selection"></svg></div></div>
            <aside class="image-edit-prompt-panel">
                <div><span class="eyebrow">1 · Select</span><h3>Mark the detail</h3><p>Drag a rectangle around only the area that should change.</p><strong id="image-edit-selection-status">No area selected</strong></div>
                <div><span class="eyebrow">2 · Describe</span><h3>What should change?</h3><textarea id="image-edit-prompt" rows="7" maxlength="2000" placeholder="Remove the chair and naturally restore the wall and floor behind it."></textarea><div class="prompt-meta"><span><i class="fa-solid fa-wand-magic-sparkles"></i> Gemini precision edit</span><span id="image-edit-prompt-count">0 / 2000</span></div><button type="button" class="btn-forge btn-block" id="generate-image-area-edit"><i class="fa-solid fa-sparkles"></i> Generate preview</button></div>
                <div class="generation-status" id="image-edit-generation-status"></div>
                <div class="image-edit-review-note" id="image-edit-review-note" hidden><i class="fa-solid fa-circle-check"></i><p><strong>Preview ready.</strong> Compare it with the original, then apply it to the draft or cancel without changing anything.</p></div>
            </aside>
        </div>
        <footer class="image-workspace-footer"><span id="image-edit-footer-status">Select an image area to begin.</span><div><button type="button" class="btn-ghost" id="reset-image-area-edit"><i class="fa-solid fa-rotate-left"></i> Start over</button><button type="button" class="btn-ghost" id="toggle-image-area-original" hidden><i class="fa-solid fa-images"></i> View original</button><button type="button" class="btn-ghost" data-cancel-image-edit>Cancel</button><button type="button" class="btn-forge" id="apply-image-area-edit" disabled><i class="fa-solid fa-check"></i> Apply to draft</button></div></footer>
    </section>
</div>
