package com.songhg.firefly.iot.data.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.lang.management.RuntimeMXBean;
import java.lang.management.ThreadMXBean;
import java.lang.management.GarbageCollectorMXBean;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class SystemMonitorService {

    /**
     * 获取完整系统监控信息
     */
    public Map<String, Object> getSystemInfo() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("jvm", getJvmInfo());
        info.put("memory", getMemoryInfo());
        info.put("cpu", getCpuInfo());
        info.put("disk", getDiskInfo());
        info.put("thread", getThreadInfo());
        info.put("gc", getGcInfo());
        info.put("server", getServerInfo());
        return info;
    }

    /**
     * JVM 信息
     */
    public Map<String, Object> getJvmInfo() {
        RuntimeMXBean runtime = ManagementFactory.getRuntimeMXBean();
        Map<String, Object> jvm = new LinkedHashMap<>();
        jvm.put("name", runtime.getVmName());
        jvm.put("version", runtime.getVmVersion());
        jvm.put("vendor", runtime.getVmVendor());
        jvm.put("specVersion", runtime.getSpecVersion());
        jvm.put("startTime", runtime.getStartTime());
        jvm.put("uptimeMs", runtime.getUptime());
        jvm.put("uptimeHours", String.format("%.2f", runtime.getUptime() / 3600000.0));
        jvm.put("inputArguments", runtime.getInputArguments());
        return jvm;
    }

    /**
     * 内存信息
     */
    public Map<String, Object> getMemoryInfo() {
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        Runtime rt = Runtime.getRuntime();

        Map<String, Object> mem = new LinkedHashMap<>();
        // 堆内存
        Map<String, Object> heap = new LinkedHashMap<>();
        heap.put("initMB", memory.getHeapMemoryUsage().getInit() / 1048576);
        heap.put("usedMB", memory.getHeapMemoryUsage().getUsed() / 1048576);
        heap.put("committedMB", memory.getHeapMemoryUsage().getCommitted() / 1048576);
        heap.put("maxMB", memory.getHeapMemoryUsage().getMax() / 1048576);
        heap.put("usagePercent", String.format("%.1f", memory.getHeapMemoryUsage().getUsed() * 100.0 / memory.getHeapMemoryUsage().getMax()));
        mem.put("heap", heap);

        // 非堆内存
        Map<String, Object> nonHeap = new LinkedHashMap<>();
        nonHeap.put("initMB", memory.getNonHeapMemoryUsage().getInit() / 1048576);
        nonHeap.put("usedMB", memory.getNonHeapMemoryUsage().getUsed() / 1048576);
        nonHeap.put("committedMB", memory.getNonHeapMemoryUsage().getCommitted() / 1048576);
        mem.put("nonHeap", nonHeap);

        // Runtime 内存
        mem.put("totalMB", rt.totalMemory() / 1048576);
        mem.put("freeMB", rt.freeMemory() / 1048576);
        mem.put("maxMB", rt.maxMemory() / 1048576);
        return mem;
    }

    /**
     * CPU 信息
     */
    public Map<String, Object> getCpuInfo() {
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        Map<String, Object> cpu = new LinkedHashMap<>();
        cpu.put("availableProcessors", os.getAvailableProcessors());
        cpu.put("systemLoadAverage", os.getSystemLoadAverage());
        cpu.put("arch", os.getArch());
        cpu.put("name", os.getName());
        cpu.put("version", os.getVersion());
        return cpu;
    }

    /**
     * 磁盘信息
     */
    public List<Map<String, Object>> getDiskInfo() {
        List<Map<String, Object>> disks = new ArrayList<>();
        File[] roots = File.listRoots();
        for (File root : roots) {
            Map<String, Object> disk = new LinkedHashMap<>();
            disk.put("path", root.getAbsolutePath());
            disk.put("totalGB", String.format("%.2f", root.getTotalSpace() / 1073741824.0));
            disk.put("freeGB", String.format("%.2f", root.getFreeSpace() / 1073741824.0));
            disk.put("usableGB", String.format("%.2f", root.getUsableSpace() / 1073741824.0));
            long used = root.getTotalSpace() - root.getFreeSpace();
            disk.put("usedGB", String.format("%.2f", used / 1073741824.0));
            disk.put("usagePercent", root.getTotalSpace() > 0 ? String.format("%.1f", used * 100.0 / root.getTotalSpace()) : "0");
            disks.add(disk);
        }
        return disks;
    }

    /**
     * 线程信息
     */
    public Map<String, Object> getThreadInfo() {
        ThreadMXBean thread = ManagementFactory.getThreadMXBean();
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("threadCount", thread.getThreadCount());
        info.put("peakThreadCount", thread.getPeakThreadCount());
        info.put("daemonThreadCount", thread.getDaemonThreadCount());
        info.put("totalStartedThreadCount", thread.getTotalStartedThreadCount());
        return info;
    }

    /**
     * GC 信息
     */
    public List<Map<String, Object>> getGcInfo() {
        List<Map<String, Object>> gcList = new ArrayList<>();
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("name", gc.getName());
            info.put("collectionCount", gc.getCollectionCount());
            info.put("collectionTimeMs", gc.getCollectionTime());
            gcList.add(info);
        }
        return gcList;
    }

    /**
     * 服务器信息
     */
    public Map<String, Object> getServerInfo() {
        Map<String, Object> server = new LinkedHashMap<>();
        try {
            InetAddress addr = InetAddress.getLocalHost();
            server.put("hostName", addr.getHostName());
            server.put("hostAddress", addr.getHostAddress());
        } catch (Exception e) {
            server.put("hostName", "unknown");
            server.put("hostAddress", "unknown");
        }
        server.put("osName", System.getProperty("os.name"));
        server.put("osArch", System.getProperty("os.arch"));
        server.put("osVersion", System.getProperty("os.version"));
        server.put("javaVersion", System.getProperty("java.version"));
        server.put("javaHome", System.getProperty("java.home"));
        server.put("userDir", System.getProperty("user.dir"));
        server.put("userTimezone", System.getProperty("user.timezone"));
        return server;
    }
}
