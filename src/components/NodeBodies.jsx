import { Box } from "lucide-react";
import { allowFileDrop, firstAcceptedFile, mediaAccept, outputItemFromDataTransfer } from "../mediaAssets.js";
import { MediaPreview, UploadIcon } from "./MediaViews.jsx";
import { OutputPortRow, PortHandle } from "./NodePorts.jsx";

export function PlainTextNodeBody({ node, outputPort, onUpdate, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className="node-body text-node-body plain-text-node-body">
      <OutputPortRow node={node} port={outputPort} label="" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      <div className="text-single-panel">
        <label className="text-field-group">
          <textarea aria-label="Text prompt" value={node.data.text || ""} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
        </label>
      </div>
    </div>
  );
}

export function TextModelNodeBody({ node, config, outputPort, incoming, onUpdate, onRun, running, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  const hasOutputPanel = Boolean(node.data.resultText) || node.data.status === "running" || node.data.status === "complete";
  const textPort = config.input.find((port) => port.id === "textIn");
  const imagePort = config.input.find((port) => port.id === "imageIn");
  const videoPort = config.input.find((port) => port.id === "videoIn");
  const stylePort = config.input.find((port) => port.id === "styleIn");
  const hasRunInput =
    Boolean(String(node.data.text || "").trim()) ||
    Boolean(incoming.textIn?.length) ||
    Boolean(incoming.imageIn?.length) ||
    Boolean(incoming.videoIn?.length) ||
    Boolean(incoming.styleIn?.length);

  return (
    <div className="node-body text-node-body">
      <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      <div className="text-input-port-stack" aria-label="Smart Text Model node inputs">
        {[textPort, imagePort, videoPort, stylePort].filter(Boolean).map((port) => (
          <PortHandle
            key={port.id}
            node={node}
            port={port}
            side="input"
            onConnectStart={onConnectStart}
            onDisconnectInput={onDisconnectInput}
            connectedPortKeys={connectedPortKeys}
          />
        ))}
      </div>
      <div className={hasOutputPanel ? "text-split-panel" : "text-single-panel"}>
        <label className="text-field-group">
          <span>Original prompt</span>
          <textarea aria-label="Smart Text Model prompt" value={node.data.text || ""} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
        </label>
        {hasOutputPanel && (
          <label className="text-field-group">
            <span>Output</span>
            <textarea
              value={node.data.resultText || ""}
              placeholder={running ? "Running..." : "Output will appear here"}
              onChange={(event) => onUpdate(node.id, { resultText: event.target.value })}
            />
          </label>
        )}
      </div>
      <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !hasRunInput}>
        {running ? "Running..." : "Run Smart Text Model"}
      </button>
      {node.data.lastRunModel && <small className="upload-status">Processed with {node.data.lastRunModel}</small>}
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}

export function MediaAssetNodeBody({ node, outputPort, onUpload, onOutputImport, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div
      className="node-body media-node-body"
      onDragOver={allowFileDrop}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const outputItem = outputItemFromDataTransfer(event.dataTransfer);
        if (outputItem) {
          onOutputImport?.(node, outputItem);
          return;
        }
        const file = firstAcceptedFile(event.dataTransfer.files, node.type);
        if (file) onUpload(node, file);
      }}
    >
      <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      <MediaPreview node={node} />
      <label className="media-upload-card">
        <UploadIcon type={node.type} />
        <span>{node.data.resultUrl ? "Replace upload" : "Upload"}</span>
        <input type="file" accept={mediaAccept(node.type)} onChange={(event) => onUpload(node, event.target.files?.[0])} />
      </label>
      {node.data.fileName && <small>{node.data.fileName}</small>}
      {node.data.status === "uploading" && <small className="upload-status">Uploading...</small>}
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}

export function ComposerNodeBody({ node, imageOutputPort, composerInputPorts, onOpenComposer, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className="node-body composer-node-body">
      {imageOutputPort && <OutputPortRow node={node} port={imageOutputPort} label="Frame output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />}
      <div className={`composer-node-preview ${node.data.resultUrl ? "" : "empty"}`}>
        {node.data.resultUrl ? (
          <img src={node.data.resultUrl} alt="Composer frame" />
        ) : (
          <>
            <Box size={28} />
            <span>No frame captured</span>
          </>
        )}
      </div>
      <button className="run-node-button" onClick={() => onOpenComposer?.(node.id)}>
        Open Composer
      </button>
      <div className="composer-input-list" aria-label="Composer inputs">
        {composerInputPorts.map((port) => (
          <div key={port.id} className="composer-input-row">
            <PortHandle
              node={node}
              port={port}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
            <span title={port.label}>{port.label}</span>
          </div>
        ))}
      </div>
      {node.data.status === "uploading" && <small className="upload-status">Capturing...</small>}
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}
