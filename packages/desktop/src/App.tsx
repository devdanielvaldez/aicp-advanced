import { useEffect, useState } from 'react';
import { fetchModels, selectModels, startDebateWebSocket, DebateEvent } from './services/api';

function App() {
  const [models, setModels] = useState<any[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [rounds, setRounds] = useState(2);
  const [interactive, setInteractive] = useState(false);
  const [graph, setGraph] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [selfEval, setSelfEval] = useState(false);
  const [memory, setMemory] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState('');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const data = await fetchModels();
      setModels(data.models);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectModels = async () => {
    if (selectedModels.length === 0) {
      alert('Select at least one model');
      return;
    }
    await selectModels(selectedModels);
    alert('Models selected');
  };

  const startDebate = () => {
    if (!prompt.trim()) {
      alert('Enter a prompt');
      return;
    }
    if (selectedModels.length < 2) {
      alert('Select at least 2 models');
      return;
    }
    setIsRunning(true);
    setLogs([]);
    setFinalAnswer('');
    const ws = startDebateWebSocket(prompt, rounds, interactive, graph, turbo, selfEval, memory);
    ws.onmessage = (event) => {
      const data: DebateEvent = JSON.parse(event.data);
      if (data.type === 'log') {
        setLogs((prev) => [...prev, data.content]);
      } else if (data.type === 'final') {
        setFinalAnswer(data.content);
        setIsRunning(false);
        ws.close();
      } else if (data.type === 'error') {
        setLogs((prev) => [...prev, `[ERROR] ${data.content}`]);
        setIsRunning(false);
        ws.close();
      }
    };
    ws.onerror = (err) => {
      setLogs((prev) => [...prev, `WebSocket error: ${err}`]);
      setIsRunning(false);
    };
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">AICP Desktop</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block mb-1">Prompt</label>
            <textarea
              className="w-full p-2 bg-gray-800 rounded"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your question..."
            />
          </div>
          <div>
            <label className="block mb-1">Rounds (1-5)</label>
            <input
              type="number"
              className="w-24 p-2 bg-gray-800 rounded"
              min={1}
              max={5}
              value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} />
              Interactive mode
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={graph} onChange={(e) => setGraph(e.target.checked)} />
              Graph visualizer
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
              Turbo mode
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selfEval} onChange={(e) => setSelfEval(e.target.checked)} />
              Self-evaluation
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} />
              Long-term memory
            </label>
          </div>
          <div>
            <label className="block mb-1">Models</label>
            <div className="space-y-1 max-h-48 overflow-y-auto bg-gray-800 p-2 rounded">
              {models.map((m) => (
                <label key={m.name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    value={m.name}
                    checked={selectedModels.includes(m.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedModels((prev) => [...prev, m.name]);
                      } else {
                        setSelectedModels((prev) => prev.filter((s) => s !== m.name));
                      }
                    }}
                  />
                  {m.name} ({m.details?.parameter_size || '?'})
                </label>
              ))}
            </div>
            <button
              className="mt-2 bg-blue-600 px-4 py-1 rounded text-sm"
              onClick={handleSelectModels}
            >
              Save model selection
            </button>
          </div>
          <button
            className="bg-green-600 px-6 py-2 rounded disabled:opacity-50"
            onClick={startDebate}
            disabled={isRunning}
          >
            {isRunning ? 'Debate in progress...' : 'Start Debate'}
          </button>
        </div>
        <div className="bg-black rounded p-4 h-96 overflow-auto font-mono text-sm">
          {logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
          {finalAnswer && (
            <div className="mt-4 p-2 bg-gray-800 rounded">
              <div className="font-bold">Final Answer:</div>
              <div>{finalAnswer}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;