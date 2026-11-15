# Proveniência do Crypto Core experimental

Origem: branch `codex/salta-e2ee-implementacao`, commit `78dd2bed96992e7f7b39690abce0aefd7a2fda91`.

Arquivos auditados e reutilizados de `security/crypto/`: `crypto-format.js`, `encryption.js`, `decryption.js`, `key-generation.js`. De `security/storage/`: `device-key-store.js`.

Alterações locais: tipo de objeto `assessment.bundle.v1` na allowlist e namespace IndexedDB `salta-assessments-homologacao`. AES-256-GCM, HKDF-SHA-256, salt de 32 bytes, nonce de 12 bytes, AAD canônico e exigência de CryptoKey não exportável foram preservados. O material bruto gerado para a chave de escopo é descartado após armazenamento da CryptoKey.

Esta reutilização **não integra** identidade P-256/HPKE, recuperação, enrollment de dispositivo ou autenticação produtiva da branch experimental. A avaliação da compatibilidade encontrou esses bloqueios; o adaptador é exclusivamente sintético/local. Os 12 testes originais do Crypto Core foram repetidos na branch de origem, sem modificá-la. Testes deste laboratório verificam cifra, adulteração, chave/contexto/revisão incorretos e recusa de chaves ausentes.

Uma CryptoKey não exportável continua utilizável por JavaScript comprometido da mesma origem. A persistência local e o ciphertext no D1 não constituem, sozinhos, homologação E2EE. Não há suporte a outro dispositivo nem chave mestra do servidor.
