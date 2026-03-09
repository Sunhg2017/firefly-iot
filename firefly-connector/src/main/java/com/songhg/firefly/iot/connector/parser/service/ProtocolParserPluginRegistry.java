package com.songhg.firefly.iot.connector.parser.service;

import com.songhg.firefly.iot.api.dto.ProtocolParserPluginCatalogItemDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPluginDTO;
import com.songhg.firefly.iot.plugin.protocol.ProtocolParserPlugin;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
public class ProtocolParserPluginRegistry {

    private final Map<String, LoadedPlugin> plugins = new ConcurrentHashMap<>();
    private final List<URLClassLoader> externalClassLoaders = new CopyOnWriteArrayList<>();
    private final Path pluginDir = Paths.get("plugins", "protocol-parsers");

    @PostConstruct
    public void initialize() {
        reload();
    }

    @PreDestroy
    public void shutdown() {
        closeExternalLoaders();
    }

    public synchronized List<ProtocolParserPluginDTO> reload() {
        plugins.clear();
        closeExternalLoaders();
        loadWithClassLoader(Thread.currentThread().getContextClassLoader(), "CLASSPATH", "classpath");
        loadFromPluginDirectory();
        return listInstalled();
    }

    public ProtocolParserPlugin find(String pluginId, String version) {
        if (pluginId == null || pluginId.isBlank()) {
            return null;
        }
        if (version != null && !version.isBlank()) {
            LoadedPlugin loadedPlugin = plugins.get(pluginKey(pluginId, version));
            return loadedPlugin == null ? null : loadedPlugin.plugin();
        }
        return plugins.values().stream()
                .filter(item -> pluginId.equals(item.plugin().pluginId()))
                .max(Comparator.comparing(item -> item.plugin().version(), Comparator.nullsLast(String::compareToIgnoreCase)))
                .map(LoadedPlugin::plugin)
                .orElse(null);
    }

    public List<ProtocolParserPluginDTO> listInstalled() {
        return plugins.values().stream()
                .sorted(Comparator
                        .comparing((LoadedPlugin item) -> item.plugin().pluginId())
                        .thenComparing(item -> item.plugin().version(), Comparator.nullsLast(String::compareToIgnoreCase)))
                .map(this::toDto)
                .toList();
    }

    public List<ProtocolParserPluginCatalogItemDTO> listCatalog() {
        Map<String, LoadedPlugin> installedById = new ConcurrentHashMap<>();
        plugins.values().forEach(item -> installedById.put(item.plugin().pluginId(), item));

        List<ProtocolParserPluginCatalogItemDTO> catalog = new ArrayList<>();
        catalog.add(buildCatalogItem("demo-json-bridge", "1.0.0", "Demo JSON Bridge", "Firefly", "Sample parser and encoder plugin for JSON payloads.", installedById));
        catalog.add(buildCatalogItem("demo-hex-frame", "1.0.0", "Demo HEX Frame", "Firefly", "Sample binary frame parser for HEX telemetry.", installedById));
        plugins.values().forEach(item -> {
            if (catalog.stream().noneMatch(entry -> entry.getPluginId().equals(item.plugin().pluginId()))) {
                catalog.add(buildCatalogItem(
                        item.plugin().pluginId(),
                        item.plugin().version(),
                        item.plugin().displayName(),
                        "Local",
                        item.plugin().description(),
                        installedById
                ));
            }
        });
        return catalog;
    }

    private ProtocolParserPluginCatalogItemDTO buildCatalogItem(String pluginId,
                                                                String latestVersion,
                                                                String displayName,
                                                                String vendor,
                                                                String description,
                                                                Map<String, LoadedPlugin> installedById) {
        ProtocolParserPluginCatalogItemDTO dto = new ProtocolParserPluginCatalogItemDTO();
        dto.setPluginId(pluginId);
        dto.setLatestVersion(latestVersion);
        dto.setDisplayName(displayName);
        dto.setVendor(vendor);
        dto.setDescription(description);
        LoadedPlugin installed = installedById.get(pluginId);
        dto.setInstalled(installed != null);
        dto.setInstalledVersion(installed == null ? null : installed.plugin().version());
        dto.setInstallHint(installed == null ? "Drop plugin jar into plugins/protocol-parsers and reload." : "Already installed");
        return dto;
    }

    private void loadFromPluginDirectory() {
        if (!Files.isDirectory(pluginDir)) {
            return;
        }
        try (var files = Files.list(pluginDir)) {
            files.filter(path -> path.toString().toLowerCase().endsWith(".jar"))
                    .forEach(this::loadJar);
        } catch (IOException ex) {
            log.warn("Failed to scan protocol parser plugin directory {}: {}", pluginDir, ex.getMessage());
        }
    }

    private void loadJar(Path jarPath) {
        try {
            URLClassLoader classLoader = new URLClassLoader(new URL[]{jarPath.toUri().toURL()}, getClass().getClassLoader());
            externalClassLoaders.add(classLoader);
            loadWithClassLoader(classLoader, "JAR", jarPath.toAbsolutePath().toString());
        } catch (Exception ex) {
            log.warn("Failed to load protocol parser plugin jar {}: {}", jarPath, ex.getMessage());
        }
    }

    private void loadWithClassLoader(ClassLoader classLoader, String sourceType, String sourceLocation) {
        try {
            ServiceLoader.load(ProtocolParserPlugin.class, classLoader).forEach(plugin -> register(plugin, sourceType, sourceLocation));
        } catch (Exception ex) {
            log.warn("Failed to load protocol parser plugins from {}: {}", sourceLocation, ex.getMessage());
        }
    }

    private void register(ProtocolParserPlugin plugin, String sourceType, String sourceLocation) {
        if (plugin == null || plugin.pluginId() == null || plugin.pluginId().isBlank()) {
            return;
        }
        String key = pluginKey(plugin.pluginId(), plugin.version());
        LoadedPlugin existing = plugins.put(key, new LoadedPlugin(plugin, sourceType, sourceLocation, LocalDateTime.now()));
        if (existing == null) {
            log.info("Protocol parser plugin loaded: pluginId={}, version={}, sourceType={}, sourceLocation={}",
                    plugin.pluginId(), plugin.version(), sourceType, sourceLocation);
        }
    }

    private ProtocolParserPluginDTO toDto(LoadedPlugin loadedPlugin) {
        ProtocolParserPluginDTO dto = new ProtocolParserPluginDTO();
        dto.setPluginId(loadedPlugin.plugin().pluginId());
        dto.setVersion(loadedPlugin.plugin().version());
        dto.setDisplayName(loadedPlugin.plugin().displayName());
        dto.setDescription(loadedPlugin.plugin().description());
        dto.setSupportsParse(loadedPlugin.plugin().supportsParse());
        dto.setSupportsEncode(loadedPlugin.plugin().supportsEncode());
        dto.setSourceType(loadedPlugin.sourceType());
        dto.setSourceLocation(loadedPlugin.sourceLocation());
        dto.setLoadedAt(loadedPlugin.loadedAt().toString());
        return dto;
    }

    private String pluginKey(String pluginId, String version) {
        return pluginId + ":" + (version == null ? "" : version);
    }

    private void closeExternalLoaders() {
        externalClassLoaders.forEach(loader -> {
            try {
                loader.close();
            } catch (IOException ex) {
                log.debug("Close plugin classloader failed: {}", ex.getMessage());
            }
        });
        externalClassLoaders.clear();
    }

    private record LoadedPlugin(ProtocolParserPlugin plugin,
                                String sourceType,
                                String sourceLocation,
                                LocalDateTime loadedAt) {
    }
}
